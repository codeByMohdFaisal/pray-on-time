import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import * as DocumentPicker from 'expo-document-picker';
import Alarm, { AlarmStatus } from '../modules/azan-alarm';
import { AlertMode, Masjid, sampleTables, SavedState, Timetable } from './domain';
import { api, normaliseUrl, Session } from './api';

const CACHE = 'masjid-pilot-v1';
const TOKEN = 'masjid-volunteer-v1';
const FIRST_RUN_PERMISSIONS = 'masjid-pilot-first-run-permissions-v1';
const EMPTY_STATUS: AlarmStatus = { exactAllowed: false, notificationsAllowed: false, audioReady: false, lastSync: 0, syncError: '' };
interface ContextValue {
  state: SavedState; masjids: Masjid[]; busy: boolean; ready: boolean; error: string;
  status: AlarmStatus; native: boolean; syncedAt: number;
  session: Session | null;
  act: (fn: () => Promise<void>) => Promise<void>;
  reloadMasjids: () => Promise<void>;
  select: (id: string) => Promise<void>;
  sync: () => Promise<void>;
  setMode: (mode: AlertMode) => Promise<void>;
  connect: (url: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  applyTable: (table: Timetable) => Promise<void>;
  importAudio: () => Promise<void>;
  permissions: () => Promise<void>;
  test: () => Promise<void>;
}
const Ctx = createContext<ContextValue | null>(null);
export const usePilot = () => useContext(Ctx)!;
export const DEFAULT_API_URL = 'https://pray-on-time-api.vercel.app';

export function PilotProvider({ children }: { children: React.ReactNode }) {
  // The included recording is bundled with the Android module, so a new install
  // can safely default to the full azan experience. Alarms only begin after the
  // user grants the Android permissions below.
  const initial = { ...sampleTables()[0], mode: 'audio' as AlertMode, baseUrl: DEFAULT_API_URL };
  const [state, setState] = useState<SavedState>(initial);
  const current = useRef(state);
  const [masjids, setMasjids] = useState(sampleTables().map(t => t.masjid));
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState(EMPTY_STATUS);
  const [syncedAt, setSyncedAt] = useState(0);
  const working = useRef(false);

  async function refreshStatus() { if (Alarm) setStatus(Alarm.status()); }
  async function persist(next: SavedState) {
    // Write the native schedule before showing the new preference as active.
    if (Alarm) Alarm.configure(JSON.stringify(next));
    current.current = next;
    setState(next);
    await AsyncStorage.setItem(CACHE, JSON.stringify(next));
    await refreshStatus();
  }
  async function act(fn: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError('');
    try { await fn(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function sync() {
    const previous = current.current;
    if (!previous.baseUrl) return;
    const table = await api.timetable(previous.baseUrl, previous.masjid.id);
    const native = Alarm?.getState();
    const latest = native ? JSON.parse(native) as SavedState : current.current;
    if (latest.masjid.id !== previous.masjid.id || latest.baseUrl !== previous.baseUrl) return;
    if ((table.masjid.revision ?? 0) < (latest.masjid.revision ?? 0)) throw new Error('Server returned an older timetable. Existing alerts were kept.');
    // A first install begins with a local placeholder. Its revision can happen
    // to match the server revision, so revision equality alone must never keep
    // that placeholder timetable on screen.
    await persist({ ...table, mode: latest.mode, baseUrl: latest.baseUrl });
    setSyncedAt(Date.now());
  }
  useEffect(() => {
    (async () => {
      try {
        const cached = await AsyncStorage.getItem(CACHE);
        const native = Alarm?.getState();
        const restoredState = Boolean(native || cached);
        if (restoredState) {
          const restored = JSON.parse(native || cached!) as SavedState;
          await persist(restored);
          setMasjids(restored.baseUrl ? [restored.masjid] : sampleTables().map(t => t.masjid));
        }
        if (Platform.OS === 'android') {
          const stored = await SecureStore.getItemAsync(TOKEN);
          if (stored) setSession(JSON.parse(stored));
        }
        if (current.current.baseUrl) {
          try {
            const list = await api.masjids(current.current.baseUrl);
            if (!list.length) throw new Error('No masjid has been added to this service yet. An administrator can add the first one.');
            setMasjids(list);
            const selectedStillExists = list.some(masjid => masjid.id === current.current.masjid.id);
            if (!restoredState || !selectedStillExists) {
              // Fresh installs always start with the server's first dropdown
              // option and its actual timetable, never bundled sample data.
              const table = await api.timetable(current.current.baseUrl, list[0].id);
              await persist({ ...table, mode: current.current.mode, baseUrl: current.current.baseUrl });
              setSyncedAt(Date.now());
            } else await sync();
          }
          catch (error) {
            const message = error instanceof Error ? error.message : '';
            setError(message === 'Masjid not found' || message.startsWith('No masjid has been added') ? 'No masjid has been added to this service yet. An administrator can add the first one.' : 'Offline or server unavailable. Showing downloaded timings.');
          }
        }
        await refreshStatus();
        if (Platform.OS === 'android' && Alarm && !await AsyncStorage.getItem(FIRST_RUN_PERMISSIONS)) {
          // Do this once per installation. If it is denied, Settings still
          // provides a manual retry without nagging on every app launch.
          await AsyncStorage.setItem(FIRST_RUN_PERMISSIONS, 'shown');
          await permissions();
        }
      } catch { setError('Could not restore settings. Re-select your masjid before enabling alerts.'); }
      finally { setReady(true); }
    })();
    const subscription = AppState.addEventListener('change', s => {
      if (s === 'active') void act(async () => { await refreshStatus(); await sync(); if (Alarm) Alarm.configure(JSON.stringify(current.current)); });
    });
    return () => subscription.remove();
    // Provider initializes once. Async handlers use current rather than stale state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function connect(value: string) {
    const baseUrl = normaliseUrl(value);
    if (!baseUrl) {
      await logout();
      setMasjids(sampleTables().map(t => t.masjid));
      await persist({ ...sampleTables()[0], mode: 'audio', baseUrl: '' });
      return;
    }
    const list = await api.masjids(baseUrl);
    if (!list.length) throw new Error('This server has no participating masjids yet.');
    const table = await api.timetable(baseUrl, list[0].id);
    await logout();
    await persist({ ...table, mode: 'off', baseUrl });
    setMasjids(list);
    setSyncedAt(Date.now());
  }
  async function reloadMasjids() {
    if (!current.current.baseUrl) return;
    setMasjids(await api.masjids(current.current.baseUrl));
  }
  async function select(id: string) {
    if (id === current.current.masjid.id) return;
    const table = current.current.baseUrl ? await api.timetable(current.current.baseUrl, id) : sampleTables().find(t => t.masjid.id === id)!;
    await persist({ ...table, baseUrl: current.current.baseUrl, mode: current.current.mode });
    setSyncedAt(current.current.baseUrl ? Date.now() : 0);
  }
  async function permissions() {
    if (!Alarm) throw new Error('Install the Android app build to enable offline alarms. Browser previews and Expo Go cannot run this module.');
    if (Platform.OS === 'android' && Number(Platform.Version) >= 33 && !await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS)) {
      await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS, {
        title: 'Enable azan alerts',
        message: 'PrayOnTime needs notification permission to show and play your azan reminders.',
        buttonPositive: 'Continue',
        buttonNegative: 'Not now',
      });
    }
    await refreshStatus();
    if (!Alarm.status().exactAllowed) Alarm.openExactSettings();
  }
  async function setMode(mode: AlertMode) {
    if (mode !== 'off') {
      if (!Alarm) throw new Error('Offline alarms require the Android app build.');
      const s = Alarm.status();
      if (!s.notificationsAllowed || !s.exactAllowed) throw new Error('Enable notifications and Alarms & reminders first using the permission button.');
      if (mode === 'audio' && !s.audioReady) throw new Error('Import an azan recording before choosing audio.');
    }
    await persist({ ...current.current, mode });
  }
  async function login(email: string, password: string) {
    if (!current.current.baseUrl) throw new Error('Connect your pilot server in Settings first.');
    const result = await api.login(current.current.baseUrl, email, password);
    if (Platform.OS === 'android') await SecureStore.setItemAsync(TOKEN, JSON.stringify(result));
    setSession(result);
  }
  async function logout() {
    if (session && current.current.baseUrl) {
      try { await api.logout(current.current.baseUrl, session.token); } catch { /* Token expires server-side; always clear this device. */ }
    }
    if (Platform.OS === 'android') await SecureStore.deleteItemAsync(TOKEN);
    setSession(null);
  }
  async function applyTable(table: Timetable) {
    if (table.masjid.id === current.current.masjid.id) await persist({ ...table, mode: current.current.mode, baseUrl: current.current.baseUrl });
  }
  async function importAudio() {
    if (!Alarm) throw new Error('Audio import requires the Android app build.');
    const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
    if (!result.canceled) { await Alarm.importAudio(result.assets[0].uri); await refreshStatus(); }
  }
  async function test() {
    if (!Alarm) throw new Error('Install the Android app build to test offline alerts.');
    if (!Alarm.status().notificationsAllowed) throw new Error('Enable notifications first.');
    Alarm.test(current.current.mode === 'audio' ? 'audio' : 'notification');
  }
  return <Ctx.Provider value={{ state, masjids, busy, ready, error, status, syncedAt, native: !!Alarm, session, act, reloadMasjids, select, sync, setMode, connect, login, logout, applyTable, importAudio, permissions, test }}>{children}</Ctx.Provider>;
}
