// The Profile activity history (v259): stores what was played each day and
// draws the card under the name and icon. The rules are js/activity-rules.js.
//
// kv 'activityLog' is this device's only, like 'activeTime' (js/activity.js):
// it changes on every attempt, and a synced key writes the users/ doc on every
// change. The ELO lines come from the synced ELO histories, so they show on
// every device; the counts only on the phone that played them.
import * as db from './db.js';
import { t, tn, getLang } from './i18n.js';
import { pageHistory } from './db.js';
import { Auth } from './firebase.js';
import { addTo, prune, gamesByDay, buildFeed, ELO_KEYS, KEEP_DAYS } from './activity-rules.js';
import { dayBefore } from './streak-rules.js';

export const LOG_KEY = 'activityLog';
const FIRST_DAYS = 3;     // days shown before "Show more"
const MORE_DAYS = 7;      // and added by each tap
const ICONS = { joined: '<img src="icons/logo-mark.png" alt="">', puzzle: '🧩', survival: '🛡️', rush: '⚡', blind: '🙈', calc: '✉️', endgame: '🏁', opening: '📖', games: '♟️' };

const p2 = n => String(n).padStart(2, '0');
export const dayStr = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

// One after another, so two quick attempts never read the same old log and
// the second write lose the first.
let queue = Promise.resolve();

// `r` is { ok, miss, draw, best }: logActivity('puzzle', { ok: true }).
export function logActivity(area, r = {}) {
  queue = queue.then(async () => {
    const today = dayStr();
    const log = prune(addTo(await db.kvGet(LOG_KEY, {}), today, area, r), today);
    await db.kvSet(LOG_KEY, log);
  }).catch(e => console.error('activity log', e));
  return queue;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function dayLabel(day, today) {
  if (day === today) return t('act_today');
  if (day === dayBefore(today)) return t('act_yesterday');
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getLang() === 'en' ? 'en-US' : 'es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function rowHtml(r, last) {
  if (r.area === 'joined') {
    return `<div class="act-row act-joined${last ? ' last' : ''}"><span class="act-ico" aria-hidden="true">${ICONS.joined}</span>` +
      `<span class="act-txt">${esc(t(r.kind === 'account' ? 'act_joined_account' : 'act_joined_start'))}</span><span class="act-pills"></span></div>`;
  }
  const text = r.n == null ? t(`act_${r.area}_x`) : tn(`act_${r.area}`, r.n);
  let sub = '';
  if (r.elo != null) {
    const d = r.delta;
    const move = d ? `<span class="${d > 0 ? 'act-up' : 'act-down'}">${d > 0 ? '↗' : '↘'} ${Math.abs(d)}</span>` : '';
    const record = r.record ? `<span class="act-record">🏆 ${esc(t('act_record'))}</span>` : '';
    sub = `<small>ELO ${r.elo} ${move}${record}</small>`;
  }
  const pills = [];
  if (r.best != null) pills.push(`<b class="act-pill best">🏆 ${r.best}</b>`);
  else if (r.n != null) {
    if (r.ok) pills.push(`<b class="act-pill ok" title="${esc(t('act_ok'))}">${r.ok}</b>`);
    if (r.draw) pills.push(`<b class="act-pill draw" title="${esc(t('act_draw'))}">${r.draw}</b>`);
    if (r.miss) pills.push(`<b class="act-pill miss" title="${esc(t('act_miss'))}">${r.miss}</b>`);
  }
  return `<div class="act-row${last ? ' last' : ''}"><span class="act-ico" aria-hidden="true">${ICONS[r.area]}</span>` +
    `<span class="act-txt">${esc(text)}${sub}</span><span class="act-pills">${pills.join('')}</span></div>`;
}

// Where the history begins: the day the account was made, or — with no
// account — the oldest day anything was kept on this phone.
function joinedDay(hist, log, games) {
  const made = Auth.user?.metadata?.creationTime;
  if (made) {
    const d = new Date(made);
    if (!isNaN(d)) return { day: dayStr(d), kind: 'account' };
  }
  const dates = [
    ...Object.values(hist).flatMap(l => (Array.isArray(l) ? l : []).map(p => p?.date)),
    ...Object.keys(log),
    ...games.map(g => g.playedAt && dayStr(new Date(g.playedAt))),
  ].filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return dates.length ? { day: dates[0], kind: 'start' } : null;
}

export const ActivityFeed = {
  shown: FIRST_DAYS,
  feed: [],

  async load() {
    const today = dayStr();
    const hist = {};
    for (const [area, key] of Object.entries(ELO_KEYS)) hist[area] = await db.kvGet(key, []);
    const since = Date.now() - (KEEP_DAYS + 1) * 864e5;
    let games = [];
    try { games = (await pageHistory({ count: 600, match: g => g.playedAt >= since })).items; } catch {}
    const log = await db.kvGet(LOG_KEY, {});
    this.feed = buildFeed({ log, hist, games: gamesByDay(games, ms => dayStr(new Date(ms))), today, joined: joinedDay(hist, log, games) });
    this.today = today;
  },

  async render(el = document.getElementById('profile-activity')) {
    if (!el) return;
    await this.load();
    this.paint(el);
  },

  paint(el) {
    const days = this.feed.slice(0, this.shown);
    let html = `<h3 class="act-head">📈 <span>${esc(t('act_title'))}</span></h3>`;
    if (!days.length) html += `<p class="hint act-empty">${esc(t('act_empty'))}</p>`;
    for (const d of days) {
      html += `<div class="act-day">${esc(dayLabel(d.day, this.today))}</div>`;
      html += d.rows.map((r, i) => rowHtml(r, i === d.rows.length - 1)).join('');
    }
    const canMore = this.feed.length > this.shown, canLess = this.shown > FIRST_DAYS && this.feed.length > FIRST_DAYS;
    if (canMore || canLess) {
      html += `<div class="act-btns">` +
        (canLess ? `<button type="button" class="btn act-less">${esc(t('act_less'))}</button>` : '') +
        (canMore ? `<button type="button" class="btn act-more">${esc(t('act_more'))}</button>` : '') + `</div>`;
    }
    el.innerHTML = html;
    el.classList.remove('hidden');
    const more = el.querySelector('.act-more'), less = el.querySelector('.act-less');
    if (more) more.onclick = () => { this.shown += MORE_DAYS; this.paint(el); };
    // Back to the first days, and the card's top back on screen: the list it
    // folds away may have been many screens long.
    if (less) less.onclick = () => {
      this.shown = FIRST_DAYS;
      this.paint(el);
      const main = document.querySelector('main');
      if (main) main.scrollTop += el.getBoundingClientRect().top - 70;
    };
  },
};
