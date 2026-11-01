import React, { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import Alarm from '../../modules/azan-alarm';
import { addDays, AlertMode, dateInZone, PRAYERS, scheduleOn, Times, validateSchedule } from '../domain';
import { usePilot } from '../state';
import { Button, Card, colors, Field, Note, Page, styles, Title } from '../ui';

export default function Settings() {
  const p = usePilot();
  const [url, setUrl] = useState(p.state.baseUrl);
  const [message, setMessage] = useState('');
  const [testTimes, setTestTimes] = useState<Times>({ ...(scheduleOn(p.state, dateInZone(new Date(), p.state.masjid.timezone))?.times ?? p.state.schedules[0]?.times ?? { Fajr: '', Dhuhr: '', Asr: '', Maghrib: '', Isha: '' }) });
  const [testDate, setTestDate] = useState(dateInZone(new Date(), p.state.masjid.timezone));
  function upcomingTestTimes() {
    const zone = p.state.masjid.timezone;
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const h = Number(parts.find(v => v.type === 'hour')!.value);
    const m = Number(parts.find(v => v.type === 'minute')!.value);
    let start = h * 60 + m + 2;
    const tomorrow = start + 12 >= 1440;
    if (tomorrow) start = 2;
    setTestDate(addDays(dateInZone(now, zone), tomorrow ? 1 : 0));
    setTestTimes(Object.fromEntries(PRAYERS.map((name, i) => {
      const minutes = start + i * 3;
      return [name, `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`];
    })) as Times);
  }
  const modes: { id: AlertMode; name: string; detail: string }[] = [
    { id: 'audio', name: 'Play azan', detail: 'Included azan recording, or your own imported audio.' },
    { id: 'notification', name: 'Notification only', detail: 'An azan reminder using your notification settings.' },
    { id: 'off', name: 'Alerts off', detail: 'View timings without daily alerts.' },
  ];
  return <Page>
    <Title eyebrow="MAKE IT YOURS" subtitle="Choose how this phone reminds you.">A reminder,{ '\n' }your way.</Title>
    {!p.native && <Note>This is a screen preview. Offline alarms and audio require an Android app build; they do not run in the browser or Expo Go.</Note>}
    <Card><Text style={styles.section}>Azan alerts</Text>
      {modes.map(m => <View key={m.id} style={{ gap: 7 }}><Button label={`${p.state.mode === m.id ? '●' : '○'}  ${m.name}`} secondary={p.state.mode !== m.id} disabled={p.busy} onPress={() => void p.act(() => p.setMode(m.id))} /><Text style={styles.body}>{m.detail}</Text></View>)}
    </Card>
    <Card><Text style={styles.section}>Phone permissions</Text>
      <Text style={styles.body}>Notifications: {p.status.notificationsAllowed ? 'Allowed' : 'Not enabled'}{ '\n' }Alarms & reminders: {p.status.exactAllowed ? 'Allowed' : 'Not enabled'}</Text>
      <Button label="Enable required permissions" secondary disabled={p.busy} onPress={() => void p.act(p.permissions)} />
      <Button label="Open app system settings" secondary onPress={() => void Linking.openSettings()} />
      <Text style={styles.body}>Sound follows the phone’s alarm volume and system settings. Explicitly force-stopping the app prevents reliable alerts until it is reopened.</Text>
    </Card>
    <Card><Text style={styles.section}>Your azan recording</Text>
      <Text style={styles.body}>{p.status.audioReady ? 'Azan recording available offline. You can replace it with your preferred recording.' : 'The included azan is copied to this phone on first use.'}</Text>
      <Text style={styles.body} onPress={() => void Linking.openURL('https://commons.wikimedia.org/wiki/File:Beautiful_adhan.ogg')}>Included: Beautiful adhan · Adam-synagda · CC0 ↗</Text>
      <Button label={p.status.audioReady ? 'Replace recording' : 'Import audio recording'} secondary disabled={p.busy} onPress={() => void p.act(p.importAudio)} />
      <Button label="Test alert in 15 seconds" disabled={p.busy} onPress={() => void p.act(async () => { await p.test(); setMessage('Test scheduled. Turn off internet and lock your phone now.'); })} />
      <Button label="Stop playing azan" secondary onPress={() => Alarm?.stopAudio()} />
      {!!message && <Note>{message}</Note>}
    </Card>
    {!p.state.baseUrl && <Card>
      <Text style={styles.section}>Local alarm testing</Text>
      <Note>Phone-only sample timetable. These are test timings, not published masjid timings, and expire after the selected date. Enable your chosen alert mode above first. Switching sample masjids resets these test timings.</Note>
      <Button label="Fill five test times, starting in 2 minutes" secondary onPress={upcomingTestTimes} />
      <Field label="Test date · YYYY-MM-DD" value={testDate} onChangeText={setTestDate} />
      {PRAYERS.map(name => <Field key={name} label={`${name} test time · HH:MM`} value={testTimes[name]} maxLength={5} onChangeText={value => setTestTimes({ ...testTimes, [name]: value })} />)}
      <Button label="Save test timetable on this phone" disabled={p.busy} onPress={() => void p.act(async () => {
        const schedule = { validFrom: testDate, validUntil: testDate, times: testTimes };
        const error = validateSchedule(schedule); if (error) throw new Error(error);
        if (testDate < dateInZone(new Date(), p.state.masjid.timezone)) throw new Error('Choose today or a future test date.');
        await p.applyTable({ masjid: { ...p.state.masjid, revision: (p.state.masjid.revision ?? 0) + 1, updatedAt: new Date().toISOString() }, schedules: [schedule] });
        setMessage(p.state.mode === 'off' ? 'Test timetable saved. Enable an alert mode before testing.' : 'Test timetable saved. You can now disconnect internet and lock the phone.');
      })} />
    </Card>}
    <Card><Text style={styles.section}>Pilot server</Text>
      <Text style={styles.body}>Connect the shared timetable service for volunteer updates. Connecting switches alerts off so you can confirm your masjid first.</Text>
      <Field label="API server address" autoCapitalize="none" autoCorrect={false} keyboardType="url" value={url} onChangeText={setUrl} placeholder="https://your-pilot-server.example" />
      <Button label="Connect server" disabled={p.busy || !url.trim()} onPress={() => void p.act(async () => { await p.connect(url); setMessage('Connected. Choose your masjid on the My masjid tab.'); })} />
      <Button label="Use sample data" secondary disabled={p.busy} onPress={() => void p.act(async () => { await p.connect(''); setUrl(''); })} />
      <Text style={styles.body}>Online background checks are best effort, roughly every 15 minutes or later. Refresh manually for the latest changes. Offline alerts use the last downloaded schedule; expired dates have no alerts.</Text>
      {!!p.status.syncError && <Note>{p.status.syncError}</Note>}
    </Card>
    <Text style={{ color: colors.muted, fontSize: 11 }}>Android pilot · v0.1.3 · Five daily azan timings</Text>
  </Page>;
}
