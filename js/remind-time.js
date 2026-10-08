// Pure helpers for the daily reminder. No imports, so they can be unit-tested
// in Node (tests/unit/remind-time.test.js).

// The UTC hour that `localHour`:00 today falls in on this device. Rounded DOWN
// for half-hour zones (19:00 in India is 13:30 UTC -> 13), which is why those
// users get the reminder up to 30 minutes early. Must be a whole number: the
// rules refuse anything else, and the job matches on equality.
export function utcHourFor(localHour, now = new Date()) {
  const d = new Date(now);
  d.setHours(localHour, 0, 0, 0);
  return d.getUTCHours();
}

export const hourLabel = h => String(h).padStart(2, '0') + ':00';

// base64url -> bytes, for PushManager.subscribe({ applicationServerKey }).
export function keyBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64url.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, ch => ch.charCodeAt(0));
}

export function sameBytes(buf, bytes) {
  if (!buf) return false;
  const a = new Uint8Array(buf);
  return a.length === bytes.length && a.every((v, i) => v === bytes[i]);
}
