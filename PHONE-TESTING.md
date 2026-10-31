# Install and test PrayOnTime

This is a standalone, internally signed Android test build. It does not require Expo Go or a development server. It uses sample masjids until an actual timetable backend is connected.

## Quick test

1. Download the APK to your Android phone and open it to install. Allow installation from your browser or file manager if Android asks.
2. Open PrayOnTime. On My masjid, select one of the sample masjids.
3. Open Settings. Tap Enable required permissions. Allow notifications, then allow Alarms & reminders. Return to the app.
4. Choose Play azan or Notification only. The azan recording is already included and is stored offline.
5. Tap Test alert in 15 seconds. Disconnect internet, close the app normally and lock the phone. Check that the chosen alert happens. Use Stop azan in the notification to stop playback.

## Test all five scheduled alerts

1. In Settings, find Local alarm testing.
2. Tap Fill five test times, starting in 2 minutes. The five timings are three minutes apart so the included recording can finish between alerts.
3. Tap Save test timetable on this phone.
4. Return to My masjid and check the new test timings and next azan.
5. Turn off internet and lock the phone. Keep it powered on; close the app normally if you wish. Do not use Force stop in Android Settings.
6. Observe each alert, then repeat using Notification only.

These test timings apply only to this phone, only to the selected sample masjid, and expire after the selected date. Changing sample masjids resets the edited test timetable. They are not real religious timings.

## Further checks

- Save a new pending time and confirm the old alert is replaced.
- Switch sample masjids or turn alerts off and check that the old alerts do not fire.
- Save a future test time, reboot, and check that it is restored without opening the app.
- Android may show the app's next prayer alarm in its system alarm indicator; tapping it opens the app.
- Test your phone's alarm volume, silent mode, Do Not Disturb and battery optimisation settings. The app does not force the volume up or bypass system settings.
- If the phone is offline during a real committee update, it must use the last downloaded timetable until it reconnects and syncs.

## Shared volunteer updates

No public backend is preconfigured. The Volunteer tab requires the pilot API to be deployed behind HTTPS, a masjid to be added, and a volunteer account to be approved by its administrator. Backend setup is in README.md. Local alarm testing does not require an account or server.

Record your phone model, Android version, alert mode and test timing if an alert fails. Real-phone reliability remains the main acceptance test for this pilot.
