// The "badge earned" congratulation card.
//
// It used to be one more message in Kael's speech bubble, which meant it looked
// like any quote and was replaced by whatever spoke next: on the first solved
// puzzle of the day the streak celebration took the bubble 0.4 s after the
// badge appeared, and the badge was never shown again. The card is its own
// element with its own queue, so nothing Kael says can remove it.
//
// This module imports neither app.js nor badges.js. The two things it needs
// from the app -- "is the screen busy?" and "open the trophy case" -- are
// handed in through init(), so there is no import cycle to keep safe.
import { t } from './i18n.js';
import { Sound } from './sound.js';

const SHOW_MS = 4600;     // long enough to read a two-line name twice
const GAP_MS = 380;       // the leave animation, before the next card enters
const SETTLE_MS = 450;    // a beat after the move that earned it, and time for a
                          // streak celebration started by the same move to claim the screen
const HOLD_POLL_MS = 400;

export const BadgeCard = {
  queue: [],            // { id, icon, label() } waiting their turn
  seen: new Set(),      // ids already queued this session -- two checkNew() calls
                        // racing over the same solve must not show a badge twice
  current: null,
  el: null,
  timer: null,
  isBusy: () => false,
  open: () => {},
  // 'top' or 'bottom'. The CSS carries both.
  position: 'top',
  sound: 'kael-pop',    // null for silent; Sound.play already respects the sound setting

  init({ isBusy, open } = {}) {
    if (isBusy) this.isBusy = isBusy;
    if (open) this.open = open;
    const el = document.createElement('button');
    el.id = 'badge-card';
    el.type = 'button';
    el.className = 'badge-card';
    el.setAttribute('aria-live', 'polite');
    el.onclick = () => {
      if (!this.current) return;
      this.dismiss();
      this.open();
    };
    document.body.appendChild(el);
    this.el = el;
  },

  // items: [{ id, icon, label }] where label() returns the name in the language
  // current when the card is finally shown, not when it was queued.
  enqueue(items, delayMs = 0) {
    const fresh = items.filter(it => !this.seen.has(it.id));
    if (!fresh.length) return;
    for (const it of fresh) this.seen.add(it.id);
    this.queue.push(...fresh);
    if (!this.current && !this.timer) this.timer = setTimeout(() => this.pump(), Math.max(delayMs, SETTLE_MS));
  },

  pump() {
    this.timer = null;
    if (this.current || !this.queue.length || !this.el) return;
    // Never over a timed run, and never on top of the streak celebration: wait
    // and look again. Nothing is dropped while waiting.
    if (this.isBusy()) { this.timer = setTimeout(() => this.pump(), HOLD_POLL_MS); return; }
    this.show(this.queue.shift());
  },

  show(item) {
    const el = this.el;
    this.current = item;
    el.innerHTML = `
      <span class="badge-card-art"><img src="icons/badges/${item.id}.png" alt=""></span>
      <span class="badge-card-text">
        <span class="badge-card-kicker"></span>
        <span class="badge-card-name"></span>
      </span>
      <span class="badge-card-go" aria-hidden="true">›</span>`;
    el.querySelector('img').onerror = e => e.target.replaceWith(document.createTextNode(item.icon ?? '🏆'));
    el.querySelector('.badge-card-kicker').textContent = t('badge_congrats');
    el.querySelector('.badge-card-name').textContent = item.label();
    el.classList.toggle('pos-bottom', this.position === 'bottom');
    void el.offsetWidth;            // so a card following another replays its entrance
    el.classList.add('show');
    if (this.sound) Sound.play(this.sound);
    this.timer = setTimeout(() => this.dismiss(), SHOW_MS);
  },

  dismiss() {
    if (!this.current) return;
    clearTimeout(this.timer);
    this.el.classList.remove('show');
    // current stays set through the leave animation so the next card cannot
    // start on top of one that is still on its way out.
    this.timer = setTimeout(() => {
      this.current = null;
      this.el.innerHTML = '';
      this.pump();
    }, GAP_MS);
  },
};
