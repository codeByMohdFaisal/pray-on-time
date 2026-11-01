const config = {
  name: 'PrayOnTime', slug: 'pray-on-time', version: '0.1.3',
  scheme: 'masjidazan', orientation: 'portrait', userInterfaceStyle: 'light',
  icon: './assets/azan-icon.png',
  platforms: ['android', 'web'],
  android: {
    package: 'com.masjidazan.pilot',
    versionCode: 2,
    allowBackup: false,
    blockedPermissions: ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE', 'android.permission.SYSTEM_ALERT_WINDOW'],
    permissions: ['POST_NOTIFICATIONS', 'SCHEDULE_EXACT_ALARM', 'RECEIVE_BOOT_COMPLETED'],
  },
  plugins: ['expo-router', 'expo-secure-store', ['expo-build-properties', {
    android: { minSdkVersion: 26, usesCleartextTraffic: process.env.EXPO_PUBLIC_ALLOW_LOCAL_HTTP === '1' },
  }]],
  extra: { eas: { projectId: 'ae36493d-b79a-4595-906c-af740c66c67b' } },
  web: { bundler: 'metro', output: 'single' },
};
export default config;
