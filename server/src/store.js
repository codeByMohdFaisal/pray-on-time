import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { Problem, PRAYERS, addDays, localDate, emailAddress, slug, scheduleInput, replaceSchedule } from './domain.js';

const scrypt = promisify(scryptCallback);
const scryptOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const hashToken = token => createHash('sha256').update(token).digest('hex');
const dummySalt = Buffer.alloc(16).toString('hex');

export class Store {
  constructor(db, clock = () => new Date()) {
    this.db = db; this.clock = clock;
    this.masjids = db.collection('masjids');
    this.volunteers = db.collection('volunteers');
    this.sessions = db.collection('sessions');
  }
  async init() {
    await Promise.all([
      this.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
      this.sessions.createIndex({ email: 1 }),
      this.masjids.createIndex({ name: 1 }),
    ]);
  }
  publicMasjid(m) {
    return { id: m._id, name: m.name, area: m.area, timezone: m.timezone, revision: m.revision, updatedAt: m.updatedAt?.toISOString() ?? null };
  }
  publicTable(m) { return { masjid: this.publicMasjid(m), schedules: m.schedules }; }
  async listMasjids() {
    const docs = await this.masjids.find({}, { projection: { name: 1, area: 1, timezone: 1, revision: 1, updatedAt: 1 } }).sort({ name: 1 }).toArray();
    return docs.map(m => this.publicMasjid(m));
  }
  async timetable(id) {
    const m = await this.masjids.findOne({ _id: slug(id) });
    if (!m) throw new Problem(404, 'Masjid not found');
    return this.publicTable(m);
  }
  async addMasjid(id, name, area, timezone = 'Asia/Kolkata') {
    slug(id);
    if (typeof name !== 'string' || typeof area !== 'string' || !name.trim() || !area.trim() || name.length > 160 || area.length > 240) throw new Problem(400, 'Supply a masjid name and area');
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { throw new Problem(400, 'Invalid timezone'); }
    await this.masjids.insertOne({ _id: id, name: name.trim(), area: area.trim(), timezone, revision: 0, updatedAt: null, schedules: [], audit: [] });
  }
  async seedDemo() {
    const today = localDate(this.clock(), 'Asia/Kolkata');
    for (const [id, name, area] of [
      ['sample-noor', 'Sample Noor Masjid', 'Demo area A · not a real timetable'],
      ['sample-bilal', 'Sample Bilal Masjid', 'Demo area B · not a real timetable'],
    ]) {
      await this.masjids.updateOne({ _id: id }, { $setOnInsert: {
        name, area, timezone: 'Asia/Kolkata', revision: 1, updatedAt: this.clock(), audit: [],
        schedules: [{ validFrom: today, validUntil: addDays(today, 30), times: Object.fromEntries(PRAYERS.map((p, i) => [p, ['05:10', '13:15', '16:30', '18:05', '20:00'][i]])) }],
      } }, { upsert: true });
    }
  }
  async approveVolunteer(email, password, masjidId) {
    email = emailAddress(email); slug(masjidId);
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw new Problem(400, 'Use a password of 12–1024 characters');
    if (!await this.masjids.findOne({ _id: masjidId }, { projection: { _id: 1 } })) throw new Problem(404, 'Masjid not found');
    const salt = randomBytes(16).toString('hex');
    const passwordHash = (await scrypt(password, salt, 64, scryptOptions)).toString('hex');
    await this.volunteers.updateOne({ _id: email }, { $set: { masjidId, salt, passwordHash, authVersion: randomUUID() } }, { upsert: true });
    await this.sessions.deleteMany({ email });
  }
  async login(body) {
    const email = emailAddress(body.email);
    if (typeof body.password !== 'string' || body.password.length > 1024) throw new Problem(400, 'Invalid credentials format');
    const user = await this.volunteers.findOne({ _id: email });
    const calculated = await scrypt(body.password, user?.salt ?? dummySalt, 64, scryptOptions);
    if (!user || !timingSafeEqual(calculated, Buffer.from(user.passwordHash, 'hex'))) throw new Problem(401, 'Email or password is incorrect');
    const token = randomBytes(32).toString('base64url');
    await this.sessions.insertOne({ _id: hashToken(token), email, authVersion: user.authVersion, expiresAt: new Date(this.clock().getTime() + 7 * 86400000) });
    return { token, masjidId: user.masjidId, email };
  }
  async identity(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new Problem(401, 'Please sign in again');
    const session = await this.sessions.findOne({ _id: hashToken(token), expiresAt: { $gt: this.clock() } });
    const user = session && await this.volunteers.findOne({ _id: session.email, authVersion: session.authVersion });
    if (!user) throw new Problem(401, 'Please sign in again');
    return user;
  }
  async logout(token) { if (typeof token === 'string') await this.sessions.deleteOne({ _id: hashToken(token) }); }

  async update(id, body, token) {
    slug(id);
    const user = await this.identity(token);
    if (user.masjidId !== id) throw new Problem(403, 'You may only update your assigned masjid');
    const current = await this.masjids.findOne({ _id: id });
    if (!current) throw new Problem(404, 'Masjid not found');
    const now = this.clock();
    const incoming = scheduleInput(body, current.timezone, now);
    if (body.expectedRevision !== current.revision) throw new Problem(409, 'Timings changed elsewhere. Refresh before saving.');
    const schedules = replaceSchedule(current.schedules, incoming, localDate(now, current.timezone));
    // Timetable, revision, and its bounded audit history commit in ONE MongoDB
    // document write. This works on a standalone MongoDB or an Atlas replica set.
    const next = await this.masjids.findOneAndUpdate({ _id: id, revision: body.expectedRevision }, {
      $set: { schedules, updatedAt: now }, $inc: { revision: 1 },
      $push: { audit: { $each: [{ email: user._id, changedAt: now, revision: current.revision + 1, schedule: incoming }], $slice: -500 } },
    }, { returnDocument: 'after', includeResultMetadata: false });
    if (!next) throw new Problem(409, 'Timings changed elsewhere. Refresh before saving.');
    return this.publicTable(next);
  }
}
