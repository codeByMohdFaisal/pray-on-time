# PrayOnTime — Android pilot v0.1.1

An initial React Native/Expo implementation of the agreed five-azan scope. One app contains a worshipper experience and an authorised volunteer editor. The APK build uses Expo SDK 54 / React Native 0.81 with Android SDK 36, replacing the previous SDK 58 toolchain that could not be compiled in this environment. The product name and visual style are provisional.

## What is implemented

- Dropdown with masjid name and area; one followed masjid per phone.
- Five daily azan timings and the next azan, calculated in the masjid's timezone.
- Alert preference: included or imported azan audio, notification only, or off. Defaults to off. See AUDIO-CREDITS.md for the bundled CC0 recording.
- A local-only test timetable editor lets you fill five timings starting in two minutes, three minutes apart. Test schedules expire after their selected date and never publish to a masjid.
- Cached schedules, Android exact alarms, local audio storage, stop control, and a 15-second test alert.
- Native rescheduling after reboot, clock changes, app updates and granting exact-alarm permission.
- Native background timetable polling using WorkManager (15-minute minimum interval; OS may defer it). No precise or immediate background delivery promise.
- Volunteer sign-in, server-enforced assignment to one masjid, review before publication, effective dates and expiry dates.
- Node.js + Express + MongoDB API with salted scrypt password hashing, expiring hashed session tokens, login throttling, revision conflicts and an edit audit log.
- Public users do not need an account. Volunteers are approved through the server CLI; no public manager registration.

## Important validation status

Passed: TypeScript checks, ESLint, seven timing-domain tests, 12 Express/MongoDB integration tests, Expo Android JavaScript bundle export, web bundle export, and native module discovery during prebuild. A DOM integration smoke test also covers rendering, masjid switching, local test timings, the native-alarm guard, API connection, volunteer login, review/publication and the revised timing appearing for a follower using the Express/MongoDB backend. This is not a visual/device test.

APK build and package verification are recorded in BUILD-VERIFICATION.json when the release artifact is produced. Real-phone offline/locked-screen/audio/reboot behaviour still needs device testing. A JavaScript bundle export alone does not establish that these behaviours work.

The browser version is only a screen preview; it intentionally cannot enable native alarms. Expo Go does not include our custom native module. Sample schedules are clearly labelled and must not be used as actual masjid timings.

## Requirements

- Node 24 LTS (Node 22.18+ also supports the TypeScript test runner), npm.
- Backend: Node.js 22.9+ (24 LTS recommended) and MongoDB. See server/README.md.
- For local native builds: Android SDK 36, Build Tools 36.0.0, NDK 27.1.12297006, CMake 3.22.1, Gradle 8.14.3 and JDK 17. Minimum Android version is 8.0 (API 26).
- A real Android phone for the acceptance checklist below.

## Install and run the screens

```bash
npm ci
npm run web
```

The app initially opens with two sample masjids and alerts off. Browser previews do not simulate offline audio.

## Run the Node.js / Express / MongoDB API

The backend now uses Node.js, Express 5 and the official MongoDB driver. The Android API contract is unchanged, so the existing v0.1.1 APK can connect without rebuilding.

```bash
cd server
npm ci
cp .env.example .env
# Set MONGODB_URI / MONGODB_DB for your MongoDB instance.
npm start
```

In a second terminal, from `server/`:

```bash
npm run admin -- seed-demo
npm run admin -- add-masjid local-noor "Noor Masjid" "Your locality, your city"
npm run admin -- approve-volunteer committee@example.com local-noor
```

The approval command asks for a hidden password and revokes previous sessions. A real new masjid starts without timings. Its approved volunteer publishes the actual schedule in the app. Full setup, API routes, database design and test instructions are in **server/README.md**.

For a release APK, host the API behind HTTPS and enter its root URL in Settings → Pilot server. No backend has been deployed by this change. Native Android needs no CORS; a browser dashboard requires an explicitly allowed origin. Keep database credentials in the server's `.env`, never in the APK.

## Build Android locally

Generate native folders from the committed config; do not manually edit them:

```bash
EXPO_PUBLIC_ALLOW_LOCAL_HTTP=1 npx expo prebuild --platform android
npm run android
```

This is a debug build that uses Metro. It is useful for development but is not a standalone distribution build. For meaningful long-running offline/reboot tests, create an APK containing its JavaScript bundle:

```bash
npx expo prebuild --platform android
cd android
./gradlew assembleRelease
```

Configure proper signing before distribution; the generated local template may use debug signing. Use an HTTPS API for a release build. Alternatively, after configuring your own Expo account/project, `npx eas-cli@latest build --platform android --profile preview` produces an internally distributed APK. No EAS build, account connection, public deployment or store submission has been performed here.

## Use the app

1. Settings → Pilot server → Connect.
2. My masjid → choose a masjid by name and area. Connecting a different server switches alerts off.
3. Settings → allow notifications and Alarms & reminders.
4. For audio, use the bundled CC0 recording, or import a supported recording you have permission to use. Imports are copied to private storage and validated for playability, size (30 MB maximum) and duration (under 10 minutes).
5. Choose notification only or play azan. The audio option uses the phone's alarm audio settings, does not change the volume, and does not override Do Not Disturb.
6. Tap Test alert in 15 seconds; lock the phone and disconnect internet. The test uses notification mode unless audio is selected.
7. Volunteer → sign in → edit the assigned masjid → choose the effective and expiry dates → review → publish.

Online phones refresh when the app opens and on best-effort background checks. They do not instantly receive every change. Offline phones keep their last downloaded timings. Expired schedules produce no new daily alerts. Timetables must be renewed before expiry. The five daily alerts use only published schedules, never silently substituted calculated times.

## Device acceptance checklist — still to run

- Notification only: airplane mode, locked screen, app closed normally.
- Full azan recording: the same conditions; stop from notification; audio focus interruption and alarm-volume behaviour.
- At least two physical phone vendors, including a phone with aggressive battery optimisation.
- Reboot: alarms restored without opening the UI or having Metro available.
- Change Asr while a previous alarm is pending: after sync, the old alarm is cancelled and only the new one fires.
- Future-effective edit: today's alert stays unchanged, tomorrow's uses the new time.
- Offline during an edit: last-downloaded schedule remains active; reconnecting eventually replaces it.
- Expired schedule: no manufactured prayer alerts; app clearly requests a fresh timetable.
- Masjid switch and alerts off: old alerts and a pending test are cancelled; audio stops.
- Explicit Settings → Force stop: document that alarms cannot be relied on until the app is reopened.
- Notification permission denied, exact-alarm permission revoked, silent mode, DND, reboot and timezone changes.
- Unauthorized volunteer cannot edit a second masjid; stale revision requires reloading before retry.

## Checks

```bash
npm run typecheck
npm run lint
npm test
npm run test:server
npx expo export --platform android --output-dir dist-android
npx expo export --platform web --output-dir dist-web
node tests/web-smoke.cjs
```

## Key files

- `src/app/`: three app screens and Expo Router layout.
- `src/state.tsx`: cache, user selection, permission prompts, API sync and token storage.
- `src/domain.ts`: dates, effective schedules, validation and next prayer.
- `modules/azan-alarm/`: Kotlin exact alarms, playback, reboot restore and background sync.
- `server/src/`: Express API, MongoDB persistence and administrator CLI.
- `tests/` and `server/test/`: timing tests, real MongoDB/HTTP integration tests, and UI smoke tests.

Not included: maps, live azan, jamaat/Jumu'ah timings, iOS, push-based immediate updates, public account registration, password reset, multimasjid manager accounts, production hosting or public release.
