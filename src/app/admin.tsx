import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Link } from 'expo-router';
import { api } from '../api';
import { usePilot } from '../state';
import { Button, Card, Field, Note, Page, styles, Title } from '../ui';

export default function Admin() {
  const p = usePilot();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [masjidId, setMasjidId] = useState('');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [volunteerMasjidId, setVolunteerMasjidId] = useState('');
  const [volunteerEmail, setVolunteerEmail] = useState('');
  const [volunteerPassword, setVolunteerPassword] = useState('');
  const [message, setMessage] = useState('');
  const isAdmin = p.session?.role === 'admin';

  async function addMasjid() {
    const token = isAdmin ? p.session!.token : '';
    if (!token) return;
    const created = await api.createMasjid(p.state.baseUrl, { id: masjidId.trim(), name: name.trim(), area: area.trim(), timezone: timezone.trim() }, token);
    await p.reloadMasjids();
    setVolunteerMasjidId(created.id);
    setMessage(`${created.name} was added. Create its volunteer account below, then have that volunteer publish the real timings.`);
    setName(''); setArea('');
  }
  async function createVolunteer() {
    const token = isAdmin ? p.session!.token : '';
    if (!token) return;
    await api.assignVolunteer(p.state.baseUrl, volunteerMasjidId.trim(), volunteerEmail.trim(), volunteerPassword, token);
    setVolunteerPassword('');
    setMessage(`Volunteer access is ready for ${volunteerEmail.trim()}. Share the initial password privately, not in a group or public message.`);
  }

  return <Page>
    <Title eyebrow="ADMINISTRATION" subtitle="Create a masjid first, then give its authorised volunteer access to publish real timings.">Manage your pilot{ '\n' }safely.</Title>
    {!p.state.baseUrl && <Link href="/settings">Connect the pilot server in Settings first.</Link>}
    {!p.session ? <Card>
      <Text style={styles.section}>Administrator sign in</Text>
      <Note>Only an account created by the protected server bootstrap can use these forms. There is no public administrator registration.</Note>
      <Field label="Admin email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" value={email} onChangeText={setEmail} />
      <Field label="Password" secureTextEntry autoCapitalize="none" autoComplete="current-password" value={password} onChangeText={setPassword} />
      <Button label="Sign in as administrator" disabled={p.busy || !p.state.baseUrl || !email || !password} onPress={() => void p.act(async () => { await p.login(email.trim(), password); setPassword(''); })} />
    </Card> : !isAdmin ? <Card>
      <Text style={styles.section}>Administrator access required</Text>
      <Note>{p.session.email} is a volunteer account. It can publish timings only for its assigned masjid from the Volunteer tab.</Note>
      <Button label="Sign out" secondary disabled={p.busy} onPress={() => void p.act(p.logout)} />
    </Card> : <>
      <View style={styles.row}><Text style={[styles.body, { flex: 1 }]}>{p.session.email}</Text><Button label="Sign out" secondary disabled={p.busy} onPress={() => void p.act(p.logout)} /></View>
      <Card>
        <Text style={styles.section}>Add a masjid</Text>
        <Text style={styles.body}>A new masjid begins with no timetable. Its volunteer must publish confirmed timings before followers can use it.</Text>
        <Field label="Masjid ID - lowercase letters, numbers and hyphens" autoCapitalize="none" autoCorrect={false} value={masjidId} onChangeText={setMasjidId} placeholder="noor-masjid-lucknow" />
        <Field label="Masjid name" value={name} onChangeText={setName} placeholder="Noor Masjid" />
        <Field label="Locality and city" value={area} onChangeText={setArea} placeholder="Aliganj, Lucknow" />
        <Field label="Timezone" autoCapitalize="none" autoCorrect={false} value={timezone} onChangeText={setTimezone} placeholder="Asia/Kolkata" />
        <Button label="Add masjid" disabled={p.busy || !masjidId.trim() || !name.trim() || !area.trim() || !timezone.trim()} onPress={() => void p.act(addMasjid)} />
      </Card>
      <Card>
        <Text style={styles.section}>Create or reset volunteer access</Text>
        <Text style={styles.body}>This account can only update the selected masjid. Resetting it signs out previous sessions for that email.</Text>
        <Field label="Masjid ID" autoCapitalize="none" autoCorrect={false} value={volunteerMasjidId} onChangeText={setVolunteerMasjidId} placeholder="noor-masjid-lucknow" />
        <Field label="Volunteer email" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" value={volunteerEmail} onChangeText={setVolunteerEmail} />
        <Field label="Initial password - 12 characters minimum" secureTextEntry autoCapitalize="none" autoComplete="new-password" value={volunteerPassword} onChangeText={setVolunteerPassword} />
        <Button label="Save volunteer access" disabled={p.busy || !volunteerMasjidId.trim() || !volunteerEmail.trim() || volunteerPassword.length < 12} onPress={() => void p.act(createVolunteer)} />
      </Card>
      {!!message && <Note>{message}</Note>}
    </>}
  </Page>;
}
