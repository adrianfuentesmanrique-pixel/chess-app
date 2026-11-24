// Streak restores (Adrian, 2026-11-21): 2 a calendar month for the flame
// streak and 2 for the daily missions run. The rules are in js/streak-rules.js.
//
// When a run misses exactly one day, Streak.init / DailyMissions.init (js/app.js)
// keep what broke in kv streakLost / missionLost. This module offers it back:
//   - a sheet on opening the app, once a day per kind;
//   - a gold row in Profile's streak card, and Home's missions row, while the
//     offer stands;
//   - the restores left this month, under the flame and in the missions sheet.
// Restoring writes the run back with yesterday as its last day, so today's
// play carries it on. Profile's streak card and Home are drawn again.
//
// Imports from js/app.js (cycle): every binding is only touched inside a function.
import { t, tn } from './i18n.js';
import * as db from './db.js';
import { $, modal, esc, Streak, DailyMissions, Profile, Home, KaelQuotes, streakIcon } from './app.js';
import { canRestore, restoresLeft, useRestore, dayBefore } from './streak-rules.js';

function todayStr() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// The lifebuoy, drawn in gold (an emoji would not show on older Android).
export const BUOY = `<svg class="rescue-buoy" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="4" stroke-dasharray="6.3 6.3" transform="rotate(22 12 12)"/><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".55"/></svg>`;

const KINDS = {
  flame: { lostKey: 'streakLost', lastKey: 'streakLastDate' },
  missions: { lostKey: 'missionLost', lastKey: 'dailyMissionLastCompleteDate' },
};

export const Rescue = {
  // Whatever can be restored right now, per kind: { count, left } or null.
  state: { flame: null, missions: null },
  // The restores left this month, per kind (shown even with nothing to restore).
  left: { flame: 2, missions: 2 },

  async refresh() {
    const today = todayStr();
    const rec = await db.kvGet('streakRestores', null);
    for (const kind of Object.keys(KINDS)) {
      const { lostKey, lastKey } = KINDS[kind];
      const lost = await db.kvGet(lostKey, null);
      const left = restoresLeft(rec, kind, today);
      this.left[kind] = left;
      const ok = canRestore(lost, await db.kvGet(lastKey, null), today);
      this.state[kind] = ok && left > 0 ? { count: Math.floor(+lost.count), left } : null;
    }
    return this.state;
  },

  async restore(kind) {
    await this.refresh();
    const s = this.state[kind];
    if (!s) return false;
    const today = todayStr(), yesterday = dayBefore(today);
    await db.kvSet('streakRestores', useRestore(await db.kvGet('streakRestores', null), kind, today));
    if (kind === 'flame') {
      // Count and date together: the account merge (mergeStreak) goes by both.
      await db.kvSet('streakLastDate', yesterday);
      await db.kvSet('streakCount', s.count);
      await db.kvSet('streakLost', null);
      await Streak.init();
    } else {
      await db.kvSet('dailyMissionLastCompleteDate', yesterday);
      await db.kvSet('dailyMissionStreak', s.count);
      await db.kvSet('missionLost', null);
      DailyMissions.streak = s.count;
      DailyMissions.render();
    }
    await this.refresh();
    Profile.renderStreakLadder();
    Home.render();
    KaelQuotes.show({
      title: (kind === 'flame' ? '🔥 ' : '🎯 ') + t('rescue_done_title'),
      text: t(kind === 'flame' ? 'rescue_done_flame' : 'rescue_done_missions').replace('{n}', s.count).replace('{m}', s.count + 1),
      ...(kind === 'flame' ? { image: `streaks/${streakIcon(s.count)}.png`, imageClass: 'kael-quote-streak' } : {}),
      mood: 'proud',
    }, 6000);
    return true;
  },

  // The offer: the run that broke, the restores left as gold pips, restore or not now.
  async open(kind) {
    await this.refresh();
    const s = this.state[kind];
    if (!s) return;
    const flame = kind === 'flame';
    const pips = Array.from({ length: 2 }, (_, i) => `<span class="rescue-pip${i < s.left ? ' on' : ''}"></span>`).join('');
    const yes = await modal((box, close) => {
      box.classList.add('rescue-sheet');
      box.innerHTML = `<div class="rescue-pic${flame ? '' : ' missions'}">
          ${flame ? `<img src="streaks/${streakIcon(s.count)}.png" alt="" width="96" height="96">` : '<span class="rescue-target">🎯</span>'}
          <span class="rescue-pic-buoy">${BUOY}</span>
        </div>
        <h3 class="stage-sheet-title">${esc(tn(flame ? 'rescue_title_flame' : 'rescue_title_missions', s.count))}</h3>
        <p class="stage-sheet-text">${esc(t(flame ? 'rescue_text_flame' : 'rescue_text_missions').replace('{m}', s.count + 1))}</p>
        <div class="rescue-left"><span>${esc(t('rescue_left_label'))}</span><span class="rescue-pips">${pips}</span></div>`;
      const go = document.createElement('button');
      go.className = 'btn big stage-gold'; go.textContent = t('rescue_go'); go.onclick = () => close(true);
      const later = document.createElement('button');
      later.className = 'btn stage-again'; later.textContent = t('rescue_later'); later.onclick = () => close(false);
      box.append(go, later);
      const hint = document.createElement('p');
      hint.className = 'hint stage-sheet-hint'; hint.textContent = t('rescue_hint');
      box.append(hint);
    });
    if (yes) await this.restore(kind);
  },

  // On opening the app: offer each kind once a day, never over another sheet.
  async offer(tries = 20) {
    if ($('modal-root')?.children.length || document.getElementById('tour-root')) {
      if (tries > 0) setTimeout(() => this.offer(tries - 1), 3000);
      return;
    }
    await this.refresh();
    const today = todayStr();
    const seen = (await db.kvGet('rescueOffered', null)) || {};
    for (const kind of ['flame', 'missions']) {
      if (!this.state[kind] || seen[kind] === today) continue;
      seen[kind] = today;
      await db.kvSet('rescueOffered', seen);
      await this.open(kind);
    }
  },

  // Profile's streak card: the gold row while a restore stands, else the
  // restores left this month.
  flameHtml() {
    const s = this.state.flame;
    if (s) {
      return `<button type="button" class="rescue-row" data-rescue="flame">${BUOY}
        <span class="rescue-row-text"><b>${esc(tn('rescue_row', s.count))}</b><small>${esc(tn('rescue_row_left', s.left))}</small></span>
        <span class="daily-mission-arrow" aria-hidden="true">›</span></button>`;
    }
    return `<p class="rescue-note">${BUOY}${esc(this.noteText('flame'))}</p>`;
  },

  noteText(kind) {
    const n = this.left[kind];
    return n > 0 ? tn(kind === 'flame' ? 'rescue_note_flame' : 'rescue_note_missions', n) : t('rescue_none_left');
  },

  wire(root) {
    root.querySelectorAll('[data-rescue]').forEach(b => b.onclick = () => this.open(b.dataset.rescue));
  },
};
