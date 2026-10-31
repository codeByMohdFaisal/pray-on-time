import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Store } from '../src/store.js';
import { createApp } from '../src/application.js';
import { localDate, addDays } from '../src/domain.js';

process.env.MONGOMS_DISTRO ||= 'ubuntu-22.04';
process.env.MONGOMS_DOWNLOAD_IGNORE_MISSING_HEADER = 'true';
let mongo, client, db, store, server, base, token;
const today = localDate(new Date(), 'Asia/Kolkata');
const times = { Fajr: '05:15', Dhuhr: '13:15', Asr: '16:20', Maghrib: '18:10', Isha: '20:10' };
const body = (revision = 1, offset = 0) => ({ expectedRevision: revision, validFrom: addDays(today, offset), validUntil: addDays(today, 30), times });

async function request(path, { method = 'GET', data, auth = token, headers = {} } = {}) {
  const response = await fetch(base + path, { method, headers: { ...(data === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth ? { Authorization: `Bearer ${auth}` } : {}), ...headers }, body: data === undefined ? undefined : JSON.stringify(data) });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '8.0.17' }, instance: { ip: '127.0.0.1', args: ['--nounixsocket'] } });
  client = new MongoClient(mongo.getUri()); await client.connect(); db = client.db('azan_api_tests');
});
beforeEach(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await db.dropDatabase(); store = new Store(db); await store.init(); await store.seedDemo();
  await store.approveVolunteer('volunteer@example.test', 'Test-password-123', 'sample-noor');
  server = createApp(store).listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  const login = await request('/session', { method: 'POST', auth: null, data: { email: 'volunteer@example.test', password: 'Test-password-123' } });
  assert.equal(login.status, 200); token = login.data.token;
});
after(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  await client?.close(); await mongo?.stop();
});

test('public routes preserve the APK contract and omit private data', async () => {
  assert.deepEqual((await request('/health')).data, { ok: true });
  const list = await request('/masjids', { auth: null });
  assert.equal(list.data.length, 2); assert.equal(list.headers.get('cache-control'), 'no-store');
  const table = await request('/masjids/sample-noor/schedule', { auth: null });
  assert.equal(table.data.masjid.id, 'sample-noor'); assert.equal(table.data.masjid.revision, 1);
  assert.deepEqual(Object.keys(table.data.schedules[0].times), ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha']);
  assert.ok(!/password|audit|token|_id|email/.test(JSON.stringify(table.data)));
});
test('only the assigned volunteer may publish, with an atomic audit entry', async () => {
  assert.equal((await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body(), auth: null })).status, 401);
  assert.equal((await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body(), auth: 'invalid' })).status, 401);
  assert.equal((await request('/masjids/sample-bilal/schedule', { method: 'PUT', data: body() })).status, 403);
  const result = await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body() });
  assert.equal(result.status, 200); assert.equal(result.data.masjid.revision, 2);
  const doc = await db.collection('masjids').findOne({ _id: 'sample-noor' });
  assert.equal(doc.audit.length, 1); assert.equal(doc.audit[0].revision, doc.revision);
  assert.equal(doc.audit[0].email, 'volunteer@example.test');
});
test('tomorrow-effective changes leave today intact', async () => {
  const result = await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body(1, 1) });
  assert.equal(result.status, 200);
  assert.equal(result.data.schedules[0].validUntil, today);
  assert.equal(result.data.schedules[0].times.Asr, '16:30');
  assert.equal(result.data.schedules[1].times.Asr, '16:20');
});
test('concurrent and stale edits cannot overwrite a published revision', async () => {
  const results = await Promise.all([request('/masjids/sample-noor/schedule', { method: 'PUT', data: body() }), request('/masjids/sample-noor/schedule', { method: 'PUT', data: body() })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
  const doc = await db.collection('masjids').findOne({ _id: 'sample-noor' });
  assert.equal(doc.revision, 2); assert.equal(doc.audit.length, 1);
});
test('invalid dates, prayer order, types, and MongoDB query-shaped inputs are rejected', async () => {
  const invalid = [
    { ...body(), validFrom: '2026-02-30' }, { ...body(), validUntil: '2020-01-01' },
    { ...body(), times: { ...times, Asr: '12:00' } }, { ...body(), times: { ...times, Fajr: '25:00' } },
    { ...body(), expectedRevision: { $ne: null } }, { ...body(), times: { Fajr: '05:00' } },
    { ...body(), validFrom: { $gt: '' } },
  ];
  for (const data of invalid) assert.equal((await request('/masjids/sample-noor/schedule', { method: 'PUT', data })).status, 400);
  assert.equal((await request('/session', { method: 'POST', data: { email: { $ne: null }, password: 'anything' } })).status, 400);
  assert.equal((await request('/session', { method: 'POST', data: [] })).status, 400);
});
test('an existing future timetable cannot be silently overwritten', async () => {
  assert.equal((await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body(1, 5) })).status, 200);
  assert.equal((await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body(2) })).status, 409);
});
test('opaque tokens are stored hashed; logout and expiry invalidate access immediately', async () => {
  const stored = await db.collection('sessions').findOne({ email: 'volunteer@example.test' });
  assert.notEqual(stored._id, token);
  assert.equal(stored._id, createHash('sha256').update(token).digest('hex'));
  assert.ok(!JSON.stringify(stored).includes(token));
  assert.equal((await request('/session', { method: 'DELETE' })).status, 200);
  assert.equal((await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body() })).status, 401);
  token = (await store.login({ email: 'volunteer@example.test', password: 'Test-password-123' })).token;
  await db.collection('sessions').updateMany({}, { $set: { expiresAt: new Date(0) } });
  assert.equal((await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body() })).status, 401);
});
test('approving/resetting an account revokes previous sessions', async () => {
  await store.approveVolunteer('volunteer@example.test', 'Replacement-password-456', 'sample-bilal');
  assert.equal((await request('/masjids/sample-noor/schedule', { method: 'PUT', data: body() })).status, 401);
  const login = await request('/session', { method: 'POST', data: { email: 'volunteer@example.test', password: 'Replacement-password-456' } });
  assert.equal(login.status, 200); assert.equal(login.data.masjidId, 'sample-bilal');
});
test('passwords are salted scrypt hashes, never plaintext', async () => {
  const user = await db.collection('volunteers').findOne({ _id: 'volunteer@example.test' });
  assert.equal(user.passwordHash.length, 128); assert.equal(user.salt.length, 32);
  assert.ok(!JSON.stringify(user).includes('Test-password-123'));
  assert.equal((await request('/session', { method: 'POST', data: { email: 'volunteer@example.test', password: 'wrong' } })).status, 401);
});
test('large and malformed bodies return JSON errors without internal details', async () => {
  assert.equal((await request('/session', { method: 'POST', data: { email: 'a'.repeat(18000), password: 'x' } })).status, 413);
  const bad = await fetch(base + '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(bad.status, 400); assert.deepEqual(await bad.json(), { error: 'Invalid JSON request' });
});
test('login attempts are throttled and unapproved browser origins are denied', async () => {
  let last;
  for (let i = 0; i < 10; i++) last = await request('/session', { method: 'POST', data: { email: 'nobody@example.test', password: 'wrong' } });
  assert.equal(last.status, 429);
  assert.equal((await request('/masjids', { headers: { Origin: 'https://unapproved.example' } })).status, 403);
});
test('new masjids have no invented timetable; publication survives a new Store instance', async () => {
  await store.addMasjid('real-noor', 'Noor Masjid', 'Local area');
  assert.deepEqual((await store.timetable('real-noor')).schedules, []);
  await store.approveVolunteer('real@example.test', 'Real-test-password-123', 'real-noor');
  const session = await store.login({ email: 'real@example.test', password: 'Real-test-password-123' });
  await store.update('real-noor', body(0), session.token);
  const reopened = new Store(db);
  assert.equal((await reopened.timetable('real-noor')).masjid.revision, 1);
  assert.equal((await reopened.timetable('real-noor')).schedules[0].times.Asr, '16:20');
});
