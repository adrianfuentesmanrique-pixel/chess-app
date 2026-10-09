// Kael's one-time invitation to the daily reminder: the "should we ask now?"
// rule and nothing else. Imports nothing, so it runs under node --test.
// Spec: docs/superpowers/specs/2026-10-09-reminder-invitation-design.md

export const MAX_ASKS = 2;                             // once, once more, then never
export const ASK_AGAIN_MS = 7 * 24 * 60 * 60 * 1000;   // the wait before "once more"

// owed    a day was credited in this app session and the question is still due
// state   Notifications.state(); only 'off' can say yes to anything
// asks    how many times this device has been asked (MAX_ASKS = closed for good)
// lastAsk when it was last asked, ms
// busy    a timed run, a celebration or another dialog is on screen
export function shouldInvite({ owed, state, asks, lastAsk, now, online, busy }) {
  if (!owed || busy || !online || state !== 'off') return false;
  const n = Number.isFinite(asks) ? asks : 0;
  if (n <= 0) return true;
  if (n >= MAX_ASKS) return false;
  return now - (Number.isFinite(lastAsk) ? lastAsk : 0) >= ASK_AGAIN_MS;
}
