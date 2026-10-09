// The daily streak reminder: one push notification a day, at an hour the user
// picks, only when the streak is alive and today is not credited yet.
// Spec: docs/superpowers/specs/2026-10-08-daily-streak-reminder-design.md
//
// This file owns the switch, the permission prompt and the browser's push
// subscription. It never sends anything: an hourly job on GitHub does
// (tools/reminder/). Standard Web Push — there is no Firebase messaging here.
import * as db from './db.js';
import { t, getLang } from './i18n.js';
import { Auth, saveReminderPrefs, savePushSub, deletePushSub, prunePushSubs, dropThisDevicePush, pushSubIdOf } from './firebase.js';
import { utcHourFor, hourLabel, keyBytes, sameBytes } from './remind-time.js';
import { VAPID_PUBLIC_KEY } from './vapid-public.js';
import { MAX_ASKS } from './remind-invite.js';

const DEFAULT_HOUR = 19;
const KEY = keyBytes(VAPID_PUBLIC_KEY);

// Firestore writes wait forever while offline. Turning a switch on must not.
const within = (p, ms = 10000) => Promise.race([p,
  new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

function iosNeedsInstall() {
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  return isIos() && !standalone;
}

function platform() {
  const ua = navigator.userAgent;
  if (/Android/.test(ua)) return 'android';
  if (isIos()) return 'ios';
  if (/Windows|Macintosh|Linux/.test(ua)) return 'desktop';
  return 'other';
}

export const Notifications = {
  on: false,          // this device has the reminder switched on
  hour: DEFAULT_HOUR,
  failed: false,      // the last attempt to switch on did not work
  focusOnOpen: false, // the Profile row asks Settings to scroll to this block

  async init() {
    this.on = !!(await db.kvGet('remindOn', false));
    this.hour = +(await db.kvGet('remindHourLocal', DEFAULT_HOUR));
    this.refresh().catch(e => console.warn('[remind] refresh', e));
  },

  // Feature detection, never a browser-name check.
  supported() {
    return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  },

  // One of: ios-needs-install, unsupported, signed-out, denied, failed, on, off.
  // The two the user cannot fix by signing in come first.
  state() {
    if (iosNeedsInstall()) return 'ios-needs-install';
    if (!this.supported()) return 'unsupported';
    if (!Auth.user) return 'signed-out';
    if (Notification.permission === 'denied') return 'denied';
    if (this.failed) return 'failed';
    return this.on ? 'on' : 'off';
  },

  canSwitch() { return !['ios-needs-install', 'unsupported', 'signed-out'].includes(this.state()); },

  prefs(daily) {
    return {
      remindHourLocal: this.hour,
      notifyHourUtc: utcHourFor(this.hour),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      daily,
    };
  },

  // The current subscription, or a new one. A subscription made with another
  // signing key is useless to the job, so it is replaced. A browser that does
  // not report the key at all is left alone: replacing it on every app open
  // would hand out a new address each time.
  async subscription() {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    const madeWith = sub?.options?.applicationServerKey;
    if (sub && madeWith && !sameBytes(madeWith, KEY)) { await sub.unsubscribe(); sub = null; }
    return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: KEY });
  },

  // Writes this device's document if it is new or its language changed, removes
  // the previous one if the browser handed out a new endpoint, keeps 5.
  // One Firestore write per real change, not one per app open.
  async store(sub) {
    const was = await db.kvGet('pushSubId', null);
    let id = await pushSubIdOf(sub);
    if (id !== was || (await db.kvGet('pushSubLang', null)) !== getLang()) id = await savePushSub(sub, platform(), getLang());
    // On without a stored document would be a switch that does nothing.
    if (!id) throw new Error('not stored');
    if (was && was !== id) await deletePushSub(was).catch(() => {});
    await db.kvSet('pushSubId', id);
    await db.kvSet('pushSubLang', getLang());
    return prunePushSubs(5);
  },

  // MUST be called from a tap: the permission prompt needs a user gesture.
  async enable() {
    this.failed = false;
    if (!this.canSwitch()) return this.state();
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return this.state();
    try {
      if (!navigator.onLine) throw new Error('offline');
      const sub = await within(this.subscription());
      await within(this.store(sub));
      await within(saveReminderPrefs(this.prefs(true)));
      this.on = true;
      await db.kvSet('remindOn', true);
      await db.kvSet('remindSynced', this.syncKey());
    } catch (e) {
      // The Brave case lands here: subscribe() rejects with a push service error.
      console.warn('[remind] enable', e);
      this.failed = true;
      this.on = false;
      await db.kvSet('remindOn', false);
    }
    return this.state();
  },

  async disable() {
    this.failed = false;
    this.on = false;
    await dropThisDevicePush();
    try {
      // Another device may still want it: the switch is per device, the pref
      // per account, so the pref only goes off with the last subscription.
      if ((await within(prunePushSubs(5))) === 0) await within(saveReminderPrefs(this.prefs(false)));
    } catch (e) { console.warn('[remind] disable', e); }
    await db.kvSet('remindSynced', null);
    return this.state();
  },

  async setHour(h) {
    this.hour = h;
    await db.kvSet('remindHourLocal', h);
    if (!this.on) return;
    try {
      await within(saveReminderPrefs(this.prefs(true)));
      await db.kvSet('remindSynced', this.syncKey());
    } catch (e) { console.warn('[remind] hour', e); }
  },

  syncKey() { const p = this.prefs(true); return `${p.remindHourLocal}|${p.notifyHourUtc}|${p.timeZone}`; },

  // Every app open, and every return to the front. Keeps the subscription and
  // the UTC hour true (daylight saving, travel, a browser that rotated the
  // endpoint). Writes only when something changed.
  async refresh() {
    if (!this.on || !Auth.user || !this.supported() || !navigator.onLine) return;
    if (Notification.permission !== 'granted') { await this.disable(); return; }
    const sub = await within(this.subscription());
    if ((await pushSubIdOf(sub)) !== (await db.kvGet('pushSubId', null))
      || (await db.kvGet('pushSubLang', null)) !== getLang()) await within(this.store(sub));
    if ((await db.kvGet('remindSynced', null)) !== this.syncKey()) {
      await within(saveReminderPrefs(this.prefs(true)));
      await db.kvSet('remindSynced', this.syncKey());
    }
  },

  // Today got credited: a reminder still on screen is now wrong.
  async clearDaily() {
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      const list = await reg?.getNotifications({ tag: 'daily' });
      (list || []).forEach(n => n.close());
    } catch (_) {}
  },

  hintKey() {
    return { 'ios-needs-install': 'remind_ios_install', unsupported: 'remind_unsupported',
      'signed-out': 'remind_signed_out', denied: 'remind_denied', failed: 'remind_failed' }[this.state()] || 'remind_hint';
  },

  // The Settings block. Returns the elements for openSettings() to append; the
  // same createElement + .seg pattern as every other block in that sheet.
  section(segInit) {
    const label = document.createElement('label'); label.className = 'fld-label'; label.textContent = t('remind_section');
    label.id = 'remind-label';
    const seg = document.createElement('div'); seg.className = 'seg'; seg.id = 'remind-seg';
    const hourLab = document.createElement('label'); hourLab.className = 'fld-label'; hourLab.textContent = t('remind_hour');
    hourLab.htmlFor = 'remind-hour';
    const sel = document.createElement('select'); sel.className = 'input'; sel.id = 'remind-hour';
    for (let h = 0; h < 24; h++) {
      const o = document.createElement('option'); o.value = h; o.textContent = hourLabel(h);
      if (h === this.hour) o.selected = true;
      sel.appendChild(o);
    }
    const hint = document.createElement('p'); hint.className = 'hint'; hint.id = 'remind-hint';

    const paint = () => {
      const on = this.state() === 'on';
      seg.innerHTML = '';
      for (const [v, key] of [['on', 'sound_on'], ['off', 'sound_off']]) {
        const b = document.createElement('button');
        b.textContent = t(key); b.dataset.v = v; b.disabled = !this.canSwitch();
        if ((on ? 'on' : 'off') === v) b.classList.add('on');
        seg.appendChild(b);
      }
      sel.disabled = !on;
      hint.textContent = t(this.hintKey());
    };
    paint();
    segInit(seg, async v => {
      // Whoever uses this switch knows where it is: Kael's invitation is closed.
      db.kvSet('remindAskCount', MAX_ASKS);
      if (v === 'on') await this.enable(); else await this.disable();
      paint();              // a failed switch-on falls back to Off here
      this.profileRow();
    });
    sel.onchange = async () => { await this.setHour(+sel.value); this.profileRow(); };
    if (this.focusOnOpen) {
      this.focusOnOpen = false;
      setTimeout(() => label.scrollIntoView({ block: 'start' }), 60);
    }
    return [label, seg, hourLab, sel, hint];
  },

  // The one row on the Profile streak card. `open` is openSettings from app.js,
  // remembered from the first call so later repaints need no argument.
  profileRow(open) {
    if (open) this.openSettings = open;
    const el = document.getElementById('profile-remind-row');
    if (!el) return;
    el.classList.remove('hidden');
    el.textContent = this.state() === 'on'
      ? t('remind_row_on').replace('{h}', hourLabel(this.hour))
      : t('remind_row_off');
    el.onclick = () => { this.focusOnOpen = true; this.openSettings?.(); };
  },
};
