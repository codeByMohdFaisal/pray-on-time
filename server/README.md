# Masjid Azan API — Node.js, Express and MongoDB

Node.js 22.9+ (24 LTS recommended), Express 5 and the official MongoDB driver. Compatible with the existing v0.1.1 Android APK: its paths, JSON fields and opaque bearer-token format are preserved. No new APK is needed to connect this API.

## Start

From `server/`:

```bash
npm ci
cp .env.example .env
# Set MONGODB_URI to a local MongoDB or your MongoDB Atlas connection string.
npm start
```

Use MongoDB 8.x for the initial deployment. Local defaults are `mongodb://127.0.0.1:27017`, database `masjid_azan`, API `http://127.0.0.1:8000`. The database is persistent in your MongoDB instance; the test package's temporary database is never used by `npm start`.

For remote use, deploy behind HTTPS and connect its root URL in the APK's Settings → Pilot server. The release APK accepts HTTPS only. No API has been hosted by this change, and no Atlas account or database is created automatically. Keep `.env` and MongoDB credentials out of version control. Restrict database network access to the API host.

Set `HOST=0.0.0.0` when required by the host. Set `TRUST_PROXY_HOPS` only to the actual number of trusted reverse-proxy hops (default 0). Native Android does not need CORS; optionally allow exact browser origins with `CORS_ORIGINS=https://your-dashboard.example`. Do not use a wildcard.

## Add masjids and approve volunteers

```bash
npm run admin -- seed-demo
npm run admin -- add-masjid local-noor "Noor Masjid" "Your locality, your city"
npm run admin -- approve-volunteer committee@example.com local-noor
```

The last command asks you to confirm the masjid assignment, then requests a hidden password. Use at least 12 characters. It creates or resets that account and revokes its previous sessions. There is no public manager-registration or approval route. Confirm the person's authority with the committee before granting access.

`seed-demo` adds clearly marked sample masjids without accounts. It does not overwrite existing records. A real newly added masjid starts with no invented timetable. Its approved volunteer signs into the existing APK and publishes the actual timings.

## API contract

| Method | Path | Access |
|---|---|---|
| GET | `/health` | Public; checks database connectivity |
| GET | `/masjids` | Public masjid list |
| GET | `/masjids/:id/schedule` | Public timetable, with revision |
| POST | `/session` | Email/password → token, email, masjidId |
| DELETE | `/session` | Bearer token; revoke session |
| PUT | `/masjids/:id/schedule` | Approved volunteer for that masjid only |

Publish body:

```json
{
  "expectedRevision": 0,
  "validFrom": "2026-10-22",
  "validUntil": "2026-11-20",
  "times": {
    "Fajr": "05:10", "Dhuhr": "13:15", "Asr": "16:30",
    "Maghrib": "18:05", "Isha": "20:00"
  }
}
```

Use the actual current revision and valid dates when testing. Responses retain `{masjid, schedules}`. Dates follow the masjid's timezone; times are 24-hour `HH:MM`. All five prayers are required, in chronological order. Start dates must be today or later, and end dates within the next year. Future-effective changes preserve today's timing. An overlapping already-published future timetable is rejected.

Concurrent saves use a MongoDB revision filter: exactly one save for a given revision can succeed. The timetable, revision and audit entry commit in one document write, so no replica-set transaction setup is required. API responses contain active/upcoming schedules and omit credentials and audit data.

## Data and access

- `masjids`: name, area, timezone, revision, active/upcoming schedules, last 500 edit audit entries.
- `volunteers`: email, approved masjid, random salt, scrypt password hash and authorisation version.
- `sessions`: hashed opaque token, email, authorisation version and seven-day expiry. TTL cleanup plus an explicit expiry check on each protected request.

Passwords and raw session tokens are never returned in public timetable data or request logs. Approval resets invalidate old authorisation versions as well as deleting old sessions. The login route permits 10 attempts per IP in 15 minutes. That limiter is per process; use a shared limiter before scaling the API to multiple instances.

The older Python implementation is archived locally for reference and is not part of the active runtime. No deployed SQLite data existed in this pilot; there is no automatic SQLite import. If real records have been added separately, migrate them explicitly before switching clients.

## Verify

```bash
npm test
```

Tests use a real, disposable `mongod` via `mongodb-memory-server`, not mocked collections. The first run downloads its MongoDB binary. Set `MONGOMS_VERSION` if needed; the default fixture uses 8.0.17. Test data and test credentials are temporary and never copied to your configured database.

From the app project root, after `npm ci` in both directories:

```bash
npm run test:server
node tests/web-smoke.cjs
```

The second check uses the exported web UI and an ephemeral Express/MongoDB fixture. It verifies login, authorisation, publishing and the follower seeing revised timings. The installed APK's offline alarm code is unchanged by this backend replacement.
