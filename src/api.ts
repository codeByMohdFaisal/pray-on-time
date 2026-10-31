import { validateTable, Timetable, Masjid, Schedule } from './domain';
export interface Session { token: string; masjidId: string | null; email: string; role: 'admin' | 'volunteer' }
export interface MasjidInput { id: string; name: string; area: string; timezone: string }

export function normaliseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  const url = new URL(trimmed);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use a server address such as https://azan.example.com, without a path.');
  if (!__DEV__ && url.protocol !== 'https:') throw new Error('Use HTTPS in release builds.');
  return trimmed;
}
async function request<T>(base: string, path: string, method = 'GET', body?: unknown, token?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed.');
    return data as T;
  } finally { clearTimeout(timeout); }
}
export const api = {
  masjids: (base: string) => request<Masjid[]>(base, '/masjids'),
  timetable: async (base: string, id: string) => validateTable(await request(base, `/masjids/${encodeURIComponent(id)}/schedule`)),
  login: (base: string, email: string, password: string) => request<Session>(base, '/session', 'POST', { email, password }),
  logout: (base: string, token: string) => request(base, '/session', 'DELETE', undefined, token),
  createMasjid: (base: string, input: MasjidInput, token: string) => request<Masjid>(base, '/admin/masjids', 'POST', input, token),
  assignVolunteer: (base: string, masjidId: string, email: string, password: string, token: string) => request<{ ok: true }>(base, `/admin/masjids/${encodeURIComponent(masjidId)}/volunteer`, 'PUT', { email, password }, token),
  update: async (base: string, id: string, revision: number, schedule: Schedule, token: string): Promise<Timetable> => validateTable(await request(base, `/masjids/${encodeURIComponent(id)}/schedule`, 'PUT', { ...schedule, expectedRevision: revision }, token)),
};
