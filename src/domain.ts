export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type Prayer = typeof PRAYERS[number];
export type AlertMode = 'off' | 'notification' | 'audio';
export type Times = Record<Prayer, string>;
export interface Masjid { id: string; name: string; area: string; timezone: string; revision?: number; updatedAt?: string | null }
export interface Schedule { validFrom: string; validUntil: string; times: Times }
export interface Timetable { masjid: Masjid; schedules: Schedule[] }
export interface SavedState extends Timetable { mode: AlertMode; baseUrl: string }

export function dateInZone(now = new Date(), timezone = 'Asia/Kolkata'): string {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type: string) => p.find(x => x.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function addDays(date: string, days: number): string {
  const value = new Date(date + 'T12:00:00Z');
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function scheduleOn(table: Timetable, date: string): Schedule | undefined {
  return table.schedules.find(s => s.validFrom <= date && date <= s.validUntil);
}
export function clock(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

// Resolve a masjid's wall-clock time independently of the phone's timezone.
export function instantAt(date: string, time: string, zone: string): number {
  const target = Date.parse(`${date}T${time}:00Z`);
  let value = target;
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value));
    const get = (t: string) => parts.find(p => p.type === t)!.value;
    const represented = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
    value += target - represented;
  }
  return value;
}
export function nextPrayer(table: Timetable, now = new Date()): { prayer: Prayer; time: string; date: string; at: number } | undefined {
  const zone = table.masjid.timezone;
  const today = dateInZone(now, zone);
  const candidates: { prayer: Prayer; time: string; date: string; at: number }[] = [];
  for (const s of table.schedules) {
    const first = s.validFrom > today ? s.validFrom : today;
    for (const date of [first, addDays(first, 1)]) {
      if (date > s.validUntil) continue;
      for (const prayer of PRAYERS) {
        const time = s.times[prayer];
        const at = instantAt(date, time, zone);
        if (at > now.getTime()) candidates.push({ prayer, time, date, at });
      }
    }
  }
  return candidates.sort((a, b) => a.at - b.at)[0];
}

export function validateSchedule(s: Schedule): string | null {
  for (const date of [s.validFrom, s.validUntil]) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'Use YYYY-MM-DD dates.';
    const parsed = new Date(date + 'T12:00:00Z');
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return 'Enter a valid calendar date.';
  }
  if (s.validUntil < s.validFrom) return 'The end date must be on or after the start date.';
  if (PRAYERS.some(p => !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s.times[p]))) return 'Use 24-hour HH:MM for all five prayers.';
  if (PRAYERS.some((p, i) => i > 0 && s.times[p] <= s.times[PRAYERS[i - 1]])) return 'Timings must run from Fajr to Isha in order.';
  return null;
}

export function sampleTables(now = new Date()): Timetable[] {
  const today = dateInZone(now);
  return [
    { id: 'sample-noor', name: 'Sample Noor Masjid', area: 'Demo area A' },
    { id: 'sample-bilal', name: 'Sample Bilal Masjid', area: 'Demo area B' },
  ].map((m, i) => ({ masjid: { ...m, timezone: 'Asia/Kolkata', revision: 1, updatedAt: null }, schedules: [{ validFrom: today, validUntil: addDays(today, 30), times: { Fajr: '05:10', Dhuhr: '13:15', Asr: i ? '16:45' : '16:30', Maghrib: '18:05', Isha: '20:00' } }] }));
}

export function validateTable(value: unknown): Timetable {
  const t = value as Timetable;
  if (!t?.masjid || !/^[a-z0-9-]+$/.test(t.masjid.id) || !Number.isInteger(t.masjid.revision) || !Array.isArray(t.schedules) || t.schedules.length > 400) throw new Error('Invalid timetable received. Existing alerts were kept.');
  new Intl.DateTimeFormat('en', { timeZone: t.masjid.timezone });
  let previous = '';
  for (const schedule of t.schedules) {
    if (validateSchedule(schedule) || schedule.validFrom <= previous) throw new Error('Invalid or overlapping timetable. Existing alerts were kept.');
    previous = schedule.validUntil;
  }
  return t;
}
