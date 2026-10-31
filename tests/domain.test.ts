import test from 'node:test';
import assert from 'node:assert/strict';
import { addDays, clock, dateInZone, instantAt, nextPrayer, sampleTables, scheduleOn, validateSchedule, validateTable } from '../src/domain.ts';

test('masjid date follows Kolkata even when phone UTC date differs', () => {
  assert.equal(dateInZone(new Date('2026-10-21T20:00:00Z')), '2026-10-22');
  assert.equal(instantAt('2026-10-22', '05:10', 'Asia/Kolkata'), Date.parse('2026-10-21T23:40:00Z'));
});
test('date arithmetic crosses month and leap-year boundaries', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});
test('next prayer rolls to tomorrow and uses its effective schedule', () => {
  const t = sampleTables(new Date('2026-10-21T06:00:00Z'))[0];
  t.schedules[0].validUntil = '2026-10-21';
  t.schedules.push({ validFrom: '2026-10-22', validUntil: '2026-10-30', times: { ...t.schedules[0].times, Fajr: '05:20' } });
  const next = nextPrayer(t, new Date('2026-10-21T15:00:00Z'));
  assert.equal(next?.prayer, 'Fajr');
  assert.equal(next?.time, '05:20');
  assert.equal(scheduleOn(t, '2026-10-21')?.times.Fajr, '05:10');
  assert.equal(scheduleOn(t, '2026-10-22')?.times.Fajr, '05:20');
});
test('expired schedules never manufacture future alerts', () => {
  const t = sampleTables(new Date('2026-10-21T06:00:00Z'))[0];
  assert.equal(nextPrayer(t, new Date('2027-01-01T00:00:00Z')), undefined);
  assert.equal(scheduleOn(t, '2027-01-01'), undefined);
});
test('invalid calendar dates, times and prayer order rejected', () => {
  const s = sampleTables()[0].schedules[0];
  assert.ok(validateSchedule({ ...s, validFrom: '2026-02-30' }));
  assert.ok(validateSchedule({ ...s, times: { ...s.times, Fajr: '25:00' } }));
  assert.ok(validateSchedule({ ...s, times: { ...s.times, Asr: '12:00' } }));
});
test('server tables reject overlaps and missing prayers before replacing cache', () => {
  const t = sampleTables()[0];
  assert.equal(validateTable(t), t);
  assert.throws(() => validateTable({ ...t, schedules: [t.schedules[0], t.schedules[0]] }));
  assert.throws(() => validateTable({ ...t, schedules: [{ ...t.schedules[0], times: { Fajr: '05:00' } }] }));
});
test('12 hour display formats midnight and noon', () => {
  assert.equal(clock('00:05'), '12:05 AM');
  assert.equal(clock('12:00'), '12:00 PM');
});
