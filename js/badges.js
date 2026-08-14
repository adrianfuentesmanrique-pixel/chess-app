// Achievements / trophy case.
// Extracted verbatim from js/app.js.
//
// BADGE_DEFS is built at module top level from PUZZLE_THEMES,
// ENDGAME_CATEGORIES and LEVELS, so all three must come from modules that do
// NOT import app.js back. LEVELS was moved into js/engine.js for exactly this
// reason. The app.js bindings below ($, esc, KaelQuotes, activeScreen) are only
// read inside methods, which is what keeps the cycle safe.
import { t, getLang } from './i18n.js';
import * as db from './db.js';
import { PUZZLES, PUZZLE_THEMES } from './puzzles.js';
import { ENDGAME_CATEGORIES } from './endgames-data.js';
import { LEVELS } from './engine.js';
import { $, esc, KaelQuotes, activeScreen } from './app.js';

// ═════════════════════ ACHIEVEMENTS / BADGES ═════════════════════

// The daily-activity streak and the daily-mission streak run the same ladder,
// so it is written once. Both are consecutive-day counters that reset to zero
// on a missed day, which is what makes the upper rungs so steep: 3650 means a
// decade without a single gap.
const STREAK_TIERS = [
  { days: 7,    es: '1 semana',  en: '1 Week' },
  { days: 30,   es: '1 mes',     en: '1 Month' },
  { days: 90,   es: '3 meses',   en: '3 Months' },
  { days: 180,  es: '6 meses',   en: '6 Months' },
  { days: 270,  es: '9 meses',   en: '9 Months' },
  { days: 365,  es: '1 año',     en: '1 Year' },
  { days: 730,  es: '2 años',    en: '2 Years' },
  { days: 1825, es: '5 años',    en: '5 Years' },
  { days: 3650, es: '10 años',   en: '10 Years' },
];

// Puzzle Rush is scored per duration -- a 3-minute run and a 5-minute run are
// different tests, so they get their own badges off their own stored bests
// rather than sharing one overall high score.
const RUSH_TIERS = [
  { mins: 3, key: 'rushBest180', scores: [20, 30, 40] },
  { mins: 5, key: 'rushBest300', scores: [30, 40, 50] },
];

export const BADGE_DEFS = [
  // puzzle count milestones
  { id: 'puz_10', icon: '🧩', name: { es: 'Novato de la táctica', en: 'Puzzle Novice' }, check: s => s.puzzlesSolved >= 10 },
  { id: 'puz_50', icon: '🧩', name: { es: 'Aficionado', en: 'Puzzle Enthusiast' }, check: s => s.puzzlesSolved >= 50 },
  { id: 'puz_200', icon: '🧩', name: { es: 'Táctico', en: 'Tactician' }, check: s => s.puzzlesSolved >= 200 },
  { id: 'puz_1000', icon: '🧩', name: { es: 'Veterano', en: 'Puzzle Veteran' }, check: s => s.puzzlesSolved >= 1000 },
  { id: 'puz_5000', icon: '👑', name: { es: 'Maestro Táctico', en: 'Tactics Master' }, check: s => s.puzzlesSolved >= 5000 },
  // per-theme mastery
  ...PUZZLE_THEMES.map(th => ({
    id: 'theme_' + th, icon: '🎯',
    label: lang => `${lang === 'en' ? 'Master' : 'Maestro'}: ${t('theme_' + th)}`,
    check: s => (s.themeCounts[th] ?? 0) >= 50,
  })),
  // streak
  ...STREAK_TIERS.map(tier => ({
    id: 'streak_' + tier.days, icon: '🔥',
    name: { es: 'Racha: ' + tier.es, en: tier.en + ' Streak' },
    check: s => s.bestStreak >= tier.days,
  })),
  // endgame conversions
  ...ENDGAME_CATEGORIES.map(cat => ({
    id: 'endgame_' + cat, icon: '🏁',
    label: lang => `${lang === 'en' ? 'Converted' : 'Convirtió'}: ${t('cat_' + cat)}`,
    check: s => !!s.endgameConverted[cat],
  })),
  // opening trainer
  { id: 'opening_1', icon: '📖', name: { es: 'Primera apertura entrenada', en: 'First Opening Trained' }, check: s => s.openingCount >= 1 },
  { id: 'opening_3', icon: '📖', name: { es: 'Explorador de aperturas', en: 'Opening Explorer' }, check: s => s.openingCount >= 3 },
  // study / onboarding
  { id: 'first_import', icon: '📥', name: { es: 'Primera partida importada', en: 'First Game Imported' }, check: s => !!s.firstImportDone },
  { id: 'first_engine', icon: '💡', name: { es: 'Primer análisis con motor', en: 'First Engine Analysis' }, check: s => !!s.firstEngineUsed },
  // puzzle rush, per duration
  ...RUSH_TIERS.flatMap(({ mins, key, scores }) => scores.map(n => ({
    id: `rush${mins}_${n}`, icon: '⚡',
    name: { es: `Puzzle Rush ${mins} min: ${n}`, en: `Puzzle Rush ${mins} min: ${n}` },
    check: s => (s[key] ?? 0) >= n,
  }))),
  // beating the engine, per difficulty level + one for sweeping all of them
  ...LEVELS.map((lv, i) => ({
    id: 'beat_engine_' + i, icon: '🤖',
    label: lang => `${lang === 'en' ? 'Beat' : 'Venció a'} ${t('level_names')[i]}`,
    check: s => !!s.engineLevelsBeaten[i],
  })),
  { id: 'beat_engine_all', icon: '👑', name: { es: 'Venció a todos los niveles del motor', en: 'Beat Every Engine Level' }, check: s => LEVELS.every((lv, i) => !!s.engineLevelsBeaten[i]) },
  // daily missions streak -- same ladder as the activity streak, but every day
  // has to be a full sweep of all three missions
  ...STREAK_TIERS.map(tier => ({
    id: 'daily_' + tier.days, icon: '🎯',
    name: { es: 'Misiones diarias: ' + tier.es, en: 'Daily Missions: ' + tier.en },
    check: s => s.bestDailyMissionStreak >= tier.days,
  })),
];

export function badgeLabel(def) {
  return def.label ? def.label(getLang()) : def.name[getLang()];
}

export const Badges = {
  earned: {},   // id -> timestamp

  async gatherState() {
    const solved = await db.kvGet('puzzlesSolved', {});
    const themeCounts = {};
    for (const [id, rec] of Object.entries(solved)) {
      // Newer records carry their own themes; pre-split records are `true`
      // and still need the lookup, which only works if their band is loaded.
      const themes = Array.isArray(rec) ? rec : PUZZLES.find(pz => pz.id === id)?.themes;
      if (themes) for (const th of themes) themeCounts[th] = (themeCounts[th] ?? 0) + 1;
    }
    const endgameConverted = await db.kvGet('endgameConverted', {});
    const openingElo = await db.kvGet('openingElo', {});
    return {
      puzzlesSolved: Object.keys(solved).length,
      themeCounts,
      bestStreak: await db.kvGet('bestStreak', 0),
      endgameConverted,
      openingCount: Object.keys(openingElo).length,
      firstImportDone: await db.kvGet('firstImportDone', false),
      firstEngineUsed: await db.kvGet('firstEngineUsed', false),
      rushBest180: await db.kvGet('rushBest180', 0),
      rushBest300: await db.kvGet('rushBest300', 0),
      engineLevelsBeaten: await db.kvGet('engineLevelsBeaten', {}),
      bestDailyMissionStreak: await db.kvGet('bestDailyMissionStreak', 0),
    };
  },

  // delayMs lets a caller that's already occupying the Kael bubble (the streak
  // tier-up celebration) push these back instead of talking over itself.
  async checkNew(delayMs = 0) {
    this.earned = await db.kvGet('earnedBadges', {});
    const state = await this.gatherState();
    let changed = false;
    const newlyEarned = [];
    for (const def of BADGE_DEFS) {
      if (!this.earned[def.id] && def.check(state)) {
        this.earned[def.id] = Date.now();
        changed = true;
        newlyEarned.push(def);
      }
    }
    newlyEarned.forEach((def, i) => {
      setTimeout(() => {
        KaelQuotes.show({
          title: '🏆 ' + t('badge_earned'),
          text: badgeLabel(def),
          image: `icons/badges/${def.id}.png`,
        }, 5000);
      }, delayMs + i * 5200);
    });
    if (changed) await db.kvSet('earnedBadges', this.earned);
    if (activeScreen === 'profile') this.renderTrophyCase();
    return changed;
  },

  async renderTrophyCase() {
    this.earned = await db.kvGet('earnedBadges', {});
    const el = $('trophy-case');
    if (!el) return;
    el.innerHTML = '';
    const earnedCount = BADGE_DEFS.filter(d => this.earned[d.id]).length;
    $('trophy-count').textContent = `${earnedCount}/${BADGE_DEFS.length}`;
    for (const def of BADGE_DEFS) {
      const got = !!this.earned[def.id];
      const label = badgeLabel(def);
      const cell = document.createElement('div');
      cell.className = 'badge-cell' + (got ? ' earned' : '');
      cell.title = label;
      cell.innerHTML = `<div class="badge-icon"><img src="icons/badges/${def.id}.png" alt="" loading="lazy" onerror="this.replaceWith(document.createTextNode('${def.icon}'))"></div><div class="badge-name">${esc(label)}</div>`;
      el.appendChild(cell);
    }
  },
};
