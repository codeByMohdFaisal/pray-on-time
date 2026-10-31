import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { api } from '../api';
import { addDays, clock, dateInZone, PRAYERS, Schedule, scheduleOn, Timetable, Times, validateSchedule } from '../domain';
import { usePilot } from '../state';
import { Button, Card, Field, Note, Page, styles, Title } from '../ui';

export default function Volunteer() {
  const p = usePilot();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [table, setTable] = useState<Timetable | null>(null);
  const [schedule, setSchedule] = useState<Schedule | null>(null);
  const [review, setReview] = useState(false);
  const [message, setMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  function fill(next: Timetable) {
    const today = dateInZone(new Date(), next.masjid.timezone);
    const existing = scheduleOn(next, today) ?? next.schedules.find(s => s.validFrom >= today);
    setTable(next);
    setSchedule(existing ? { ...existing, validFrom: existing.validFrom < today ? today : existing.validFrom, times: { ...existing.times } } : { validFrom: today, validUntil: addDays(today, 30), times: { Fajr: '', Dhuhr: '', Asr: '', Maghrib: '', Isha: '' } });
    setReview(false);
  }
  async function load() {
    if (p.session && p.state.baseUrl) fill(await api.timetable(p.state.baseUrl, p.session.masjidId));
  }
  const assigned = p.session?.masjidId;
  const base = p.state.baseUrl;
  useEffect(() => {
    let cancelled = false;
    if (assigned && base) {
      void api.timetable(base, assigned).then(result => {
        if (!cancelled) { fill(result); setLoadError(''); }
      }).catch(error => { if (!cancelled) setLoadError(error.message); });
    }
    return () => { cancelled = true; };
    // Login and server selection are the only triggers for loading this editor.
  }, [assigned, base]);
  async function save() {
    if (!p.session || !table || !schedule) return;
    const result = await api.update(p.state.baseUrl, p.session.masjidId, table.masjid.revision!, schedule, p.session.token);
    fill(result);
    await p.applyTable(result);
    setMessage('Published. Followers receive these timings when their phones next sync.');
  }
  return <Page>
    <Title eyebrow="FOR YOUR COMMUNITY" subtitle="Keep your masjid’s five azan timings up to date.">A small update.{ '\n' }A shared reminder.</Title>
    {!p.session ? <>
      <Note>Management access is approved by the pilot administrator. Choosing this tab does not grant permission to edit a masjid.</Note>
      {!p.state.baseUrl && <Link href="/settings">Connect your pilot server in Settings →</Link>}
      <Card><Text style={styles.section}>Volunteer sign in</Text>
        <Field label="Email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" value={email} onChangeText={setEmail} />
        <Field label="Password" secureTextEntry autoCapitalize="none" autoComplete="current-password" value={password} onChangeText={setPassword} />
        <Button label="Sign in" disabled={p.busy || !email || !password} onPress={() => void p.act(async () => { await p.login(email.trim(), password); setPassword(''); })} />
      </Card>
    </> : <>
      <View style={styles.row}><Text style={[styles.body, { flex: 1 }]}>{p.session.email}</Text><Button label="Sign out" secondary disabled={p.busy} onPress={() => void p.act(p.logout)} /></View>
      {!!loadError && <Note>{loadError}</Note>}
      {table && table.masjid.id === assigned && schedule ? <Card>
        <Text style={styles.section}>{table.masjid.name}</Text><Text style={styles.body}>{table.masjid.area} · {table.masjid.timezone}</Text>
        <Field label="Effective from · YYYY-MM-DD" editable={!review && !p.busy} value={schedule.validFrom} onChangeText={validFrom => setSchedule({ ...schedule, validFrom })} />
        <Field label="Valid through · YYYY-MM-DD" editable={!review && !p.busy} value={schedule.validUntil} onChangeText={validUntil => setSchedule({ ...schedule, validUntil })} />
        <Text style={styles.body}>Enter 24-hour times. A change starting tomorrow keeps today’s schedule intact.</Text>
        {PRAYERS.map(prayer => <Field key={prayer} label={`${prayer} azan · HH:MM`} maxLength={5} placeholder="05:15" editable={!review && !p.busy} value={schedule.times[prayer]} onChangeText={value => setSchedule({ ...schedule, times: { ...schedule.times, [prayer]: value } as Times })} />)}
        {review ? <>
          <Note>Publish {schedule.validFrom} through {schedule.validUntil}?{ '\n' }{PRAYERS.map(prayer => `${prayer}: ${clock(schedule.times[prayer])}`).join(' · ')}{ '\n' }This replaces timings for these dates. Offline followers keep their saved version until they reconnect and sync.</Note>
          <Button label="Confirm and publish timings" disabled={p.busy} onPress={() => void p.act(save)} />
          <Button label="Back to editing" secondary disabled={p.busy} onPress={() => setReview(false)} />
        </> : <Button label="Review changes" disabled={p.busy} onPress={() => void p.act(async () => { const error = validateSchedule(schedule); if (error) throw new Error(error); setMessage(''); setReview(true); })} />}
        <Button label="Reload published timings" secondary disabled={p.busy} onPress={() => void p.act(load)} />
      </Card> : <Button label="Load my masjid" disabled={p.busy} onPress={() => void p.act(load)} />}
      {!!message && <Note>{message}</Note>}
      {!!table && <Card><Text style={styles.section}>Published schedules</Text>{table.schedules.map(s => <Text style={styles.body} key={s.validFrom}>{s.validFrom} → {s.validUntil}{ '\n' }{PRAYERS.map(prayer => `${prayer} ${clock(s.times[prayer])}`).join(' · ')}</Text>)}</Card>}
    </>}
  </Page>;
}
