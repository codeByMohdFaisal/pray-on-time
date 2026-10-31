export function config(env = process.env) {
  const uri = env.MONGODB_URI || 'mongodb://127.0.0.1:27017';
  const database = env.MONGODB_DB || 'masjid_azan';
  const port = Number(env.PORT || 8000), trustProxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  const bootstrapAdminEmail = env.BOOTSTRAP_ADMIN_EMAIL || '';
  const bootstrapAdminPassword = env.BOOTSTRAP_ADMIN_PASSWORD || '';
  if (!/^mongodb(?:\+srv)?:\/\//.test(uri)) throw new Error('Set a valid MONGODB_URI');
  if (!/^[A-Za-z0-9_-]{1,63}$/.test(database)) throw new Error('Invalid MONGODB_DB');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('Invalid TRUST_PROXY_HOPS');
  const corsOrigins = (env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  for (const origin of corsOrigins) {
    const url = new URL(origin);
    if (!['https:', 'http:'].includes(url.protocol) || url.origin !== origin) throw new Error('CORS_ORIGINS must contain exact http(s) origins');
  }
  if (!!bootstrapAdminEmail !== !!bootstrapAdminPassword) throw new Error('Set both bootstrap admin settings or neither');
  return { uri, database, port, host: env.HOST || '127.0.0.1', trustProxyHops, corsOrigins, bootstrapAdminEmail, bootstrapAdminPassword };
}
