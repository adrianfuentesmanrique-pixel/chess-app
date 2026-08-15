// The global leaderboard and the public profile screen behind each row.
// Extracted verbatim from js/app.js.
//
// Everything imported from js/app.js is read inside methods only, never at
// module top level — that is what makes the cycle safe.
import { t } from './i18n.js';
import * as db from './db.js';
import { ENDGAME_CATEGORIES } from './endgames-data.js';
import { Auth, fetchLeaderboard } from './firebase.js';
import { avatarHtml } from './avatars.js';
import { $, esc, segInit, showScreen, monthStr, radarThemes, RADAR_MIN, Profile }
  from './app.js';

// ═════════════════════ LEADERBOARD ═════════════════════

// Each board is one sortable field on the public /leaderboard doc. Keys must
// match the data-v values on #leaderboard-mode and the PUBLIC_KEYS list in
// firebase.js. `fallback` is what to show when a player has no score yet.
// `season` names the equivalent this-month field, where one exists. Only the
// Rush boards have seasons: ELO is a rating that already moves both ways, so
// a "this month" ELO board would just be the all-time board again.
export const LEADERBOARD_FIELDS = {
  puzzleElo:    { label: 'puzzle_elo',    fallback: 1200 },
  rushBest180:  { label: 'rush_3min',     fallback: 0, season: 'rushMonth180' },
  rushBest300:  { label: 'rush_5min',     fallback: 0, season: 'rushMonth300' },
  blindfoldElo: { label: 'blindfold_elo', fallback: 1200 },
};

// Rank bands worth showing off. Beyond the top 100 a row is just a row —
// giving every position its own colour would flatten the distinction.
export function rankTier(rank) {
  if (rank <= 3) return 'tier-podium tier-' + rank;
  if (rank <= 10) return 'tier-top10';
  if (rank <= 100) return 'tier-top100';
  return '';
}

export const Leaderboard = {
  entries: [],
  field: 'puzzleElo',
  season: false,

  init() {
    $('leaderboard-back').onclick = () => showScreen('profile');
    $('leaderboard-search').addEventListener('input', () => this.filter($('leaderboard-search').value));
    segInit($('leaderboard-mode'), v => { this.field = v; this.open(); });
    segInit($('leaderboard-period'), v => { this.season = v === 'month'; this.open(); });
  },

  // The sortable field for the current mode+period pair.
  sortField() {
    const board = LEADERBOARD_FIELDS[this.field];
    return this.season && board.season ? board.season : this.field;
  },

  async open() {
    showScreen('leaderboard');
    const board = LEADERBOARD_FIELDS[this.field];
    // The period switch only appears on boards that actually have seasons.
    $('leaderboard-period').classList.toggle('hidden', !board.season);
    if (!board.season) this.season = false;

    $('leaderboard-search').value = '';
    $('leaderboard-list').innerHTML = '';
    $('leaderboard-status').textContent = t('loading');
    try {
      // Over-fetch when showing a season: entries are sorted on the monthly
      // field, but players who set a score and then stopped playing still
      // carry last month's value until their next run clears it, so those
      // rows are dropped here rather than in the query. Firestore can't
      // filter and sort on different fields without a composite index.
      const entries = await fetchLeaderboard(this.season ? 500 : 200, this.sortField());
      this.entries = this.season
        ? entries.filter(e => e.rushMonthKey === monthStr())
        : entries;
    } catch (e) {
      this.entries = [];
      $('leaderboard-status').textContent = '⚠️ ' + (e.message || e);
      return;
    }
    this.render(this.entries);
  },

  filter(qstr) {
    const q = qstr.trim().toLowerCase();
    const list = q ? this.entries.filter(e => (e.profileName || '').toLowerCase().includes(q)) : this.entries;
    this.render(list, q);
  },

  render(list, q) {
    $('leaderboard-status').textContent = this.entries.length ? '' : t('leaderboard_empty');
    const el = $('leaderboard-list');
    el.innerHTML = '';
    if (q && !list.length) { $('leaderboard-status').textContent = t('leaderboard_no_match'); return; }
    const board = LEADERBOARD_FIELDS[this.field];
    const field = this.sortField();
    list.forEach((e, i) => {
      const rank = i + 1;
      const value = Math.round(e[field] ?? board.fallback);
      const item = document.createElement('button');
      // The metric is already named by the selected tab above the list, so the
      // row shows only what differs between players: who, and how much.
      item.className = 'lb-row ' + rankTier(rank);
      item.innerHTML =
        `<span class="lb-rank">${rank <= 3 ? ['🥇', '🥈', '🥉'][rank - 1] : rank}</span>` +
        `${avatarHtml(e.avatarId, 36)}` +
        `<span class="lb-name">${esc(e.profileName || '?')}</span>` +
        `<span class="lb-value">${value}</span>`;
      item.onclick = () => PublicProfile.open(e);
      el.appendChild(item);
    });
  },
};

// ═════════════════════ PUBLIC PROFILE ═════════════════════

// Which sections of a public profile each privacy level exposes. Adding a
// level later ('friends', 'hide activity', …) means adding a line here, not
// rewriting the screen — every check below goes through canSee().
const VISIBILITY_SECTIONS = {
  public:  ['identity', 'elo', 'charts'],
  private: ['identity', 'elo'],
};

// The single gate for "may this viewer see that section". `isSelf` short-
// circuits it: a private setting hides you from other players, never from you.
// An unknown or missing level reads as public, matching the default.
function canSee(section, entry, isSelf) {
  if (isSelf) return true;
  const level = entry.profileVisibility || 'public';
  return (VISIBILITY_SECTIONS[level] || VISIBILITY_SECTIONS.public).includes(section);
}

// Your own public document stops carrying the breakdown maps once you go
// private, so for your own row they are read back off this device instead.
async function withLocalDetail(entry) {
  const [puzzleThemeElo, openingElo, endgameElo] = await Promise.all([
    db.kvGet('puzzleThemeElo', {}),
    db.kvGet('openingElo', {}),
    db.kvGet('endgameElo', {}),
  ]);
  return { ...entry, puzzleThemeElo, openingElo, endgameElo };
}

export const PublicProfile = {
  // Which screen ◀ goes back to. Set by whoever opened the profile, so the same
  // screen can be reached from the leaderboard and from the Friends list and
  // still send you back where you came from.
  backTo: 'leaderboard',

  init() {
    $('pubprofile-back').onclick = () => showScreen(this.backTo);
  },

  async open(entry, backTo = 'leaderboard') {
    this.backTo = backTo;
    showScreen('public-profile');
    const isSelf = !!Auth.user && entry.uid === Auth.user.uid;
    const data = isSelf ? await withLocalDetail(entry) : entry;
    const charts = canSee('charts', entry, isSelf);

    $('pubprofile-name').textContent = data.profileName || '?';
    $('pubprofile-avatar-wrap').innerHTML = avatarHtml(data.avatarId, 64);

    const puzzleElo = data.puzzleElo ?? 1200;
    const themeElo = data.puzzleThemeElo ?? {};
    const openingElo = data.openingElo ?? {};
    const endgameElo = data.endgameElo ?? {};
    const blindfoldElo = data.blindfoldElo ?? 1200;

    // A private profile publishes only the averages, so fall back to those:
    // all four ELO cards stay filled without the breakdown behind them.
    // null means "no data at all" — shown as a dash, as before.
    const openingNames = Object.keys(openingElo);
    const openingAvg = openingNames.length
      ? openingNames.reduce((s, k) => s + openingElo[k], 0) / openingNames.length
      : (data.openingEloAvg ?? null);
    const endgameNames = ENDGAME_CATEGORIES.filter(c => endgameElo[c] != null);
    const endgameAvg = endgameNames.length
      ? endgameNames.reduce((s, c) => s + endgameElo[c], 0) / endgameNames.length
      : (data.endgameEloAvg ?? null);

    $('pubprofile-elo-puzzle').textContent = Math.round(puzzleElo);
    $('pubprofile-elo-opening').textContent = openingAvg == null ? '—' : Math.round(openingAvg);
    $('pubprofile-elo-endgame').textContent = endgameAvg == null ? '—' : Math.round(endgameAvg);
    $('pubprofile-elo-blindfold').textContent = Math.round(blindfoldElo);

    $('pubprofile-private-note').classList.toggle('hidden', charts);
    for (const card of document.querySelectorAll('.pubprofile-detail')) {
      card.classList.toggle('hidden', !charts);
    }
    if (!charts) return;

    Profile.drawRadar('pub-overall',
      [t('radar_axis_opening'), t('radar_axis_puzzle'), t('radar_axis_endgame')],
      [openingAvg ?? RADAR_MIN, puzzleElo, endgameAvg ?? RADAR_MIN]);

    $('pubprofile-opening-empty').classList.toggle('hidden', openingNames.length > 0);
    $('chart-pub-opening').classList.toggle('hidden', openingNames.length === 0);
    if (openingNames.length) Profile.drawRadar('pub-opening', openingNames, openingNames.map(k => openingElo[k]));

    Profile.drawRadar('pub-puzzle',
      radarThemes().map(th => t('theme_' + th)),
      radarThemes().map(th => themeElo[th] ?? 1200));

    Profile.drawRadar('pub-endgame',
      ENDGAME_CATEGORIES.map(c => t('cat_' + c)),
      ENDGAME_CATEGORIES.map(c => endgameElo[c] ?? 1200));
  },
};

