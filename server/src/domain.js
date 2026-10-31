export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export class Problem extends Error {
  constructor(status, message) { super(message); this.name = 'Problem'; this.status = status; }
}

export function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function isoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Problem(400, 'Use YYYY-MM-DD dates');
  const date = new Date(value + 'T12:00:00Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Problem(400, 'Enter a valid calendar date');
  return value;
}
export function addDays(value, count) {
  const date = new Date(value + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function localDate(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = type => parts.find(p => p.type === type).value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function slug(value) {
  if (typeof value !== 'string' || !/^[a-z0-9-]{1,80}$/.test(value)) throw new Problem(400, 'Invalid masjid id');
  return value;
}
export function emailAddress(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw new Problem(400, 'Enter a valid email address');
  return value.trim().toLowerCase();
}
export function scheduleInput(body, timezone, now) {
  if (!object(body) || !Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw new Problem(400, 'Supply an integer expectedRevision');
  const validFrom = isoDate(body.validFrom), validUntil = isoDate(body.validUntil);
  const today = localDate(now, timezone);
  if (validFrom < today || validUntil < validFrom || validUntil > addDays(today, 366)) throw new Problem(400, 'Dates must start today or later and end within one year');
  if (!object(body.times) || Object.keys(body.times).length !== 5 || PRAYERS.some(p => !Object.hasOwn(body.times, p))) throw new Problem(400, 'Supply exactly the five prayer timings');
  const times = {};
  for (const p of PRAYERS) {
    const time = body.times[p];
    if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Problem(400, 'Use 24-hour HH:MM times');
    times[p] = time;
  }
  if (PRAYERS.some((p, i) => i > 0 && times[p] <= times[PRAYERS[i - 1]])) throw new Problem(400, 'Timings must run from Fajr to Isha in order');
  return { validFrom, validUntil, times };
}

export function replaceSchedule(existing, incoming, today) {
  if (existing.some(s => s.validFrom > incoming.validFrom && s.validFrom <= incoming.validUntil)) throw new Problem(409, 'This overlaps a future timetable. End before that timetable starts.');
  const cutoff = today;
  const schedules = existing.filter(s => s.validUntil >= cutoff && s.validFrom !== incoming.validFrom).map(s => (
    s.validFrom < incoming.validFrom && s.validUntil >= incoming.validFrom
      ? { ...s, validUntil: addDays(incoming.validFrom, -1) } : s
  ));
  schedules.push(incoming);
  schedules.sort((a, b) => a.validFrom.localeCompare(b.validFrom));
  if (schedules.length > 400) throw new Problem(400, 'Too many timetable versions');
  return schedules;
}
