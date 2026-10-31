// Builds the HTTP application from injected storage.
import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { Problem, object } from './domain.js';

function bearer(req) {
  const header = req.get('Authorization');
  if (!header || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) throw new Problem(401, 'Please sign in again');
  return header.slice(7);
}
export function createApp(store, { corsOrigins = [], trustProxyHops = 0 } = {}) {
  const app = express();
  app.disable('x-powered-by');
  if (!Number.isInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 5) throw new Error('Invalid trusted proxy hop count');
  app.set('trust proxy', trustProxyHops || false);
  app.use(helmet());
  app.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use((req, res, next) => {
    const origin = req.get('Origin');
    if (origin) {
      if (!corsOrigins.includes(origin)) return next(new Problem(403, 'Browser origin is not allowed'));
      res.set('Access-Control-Allow-Origin', origin); res.vary('Origin');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    }
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
  const loginLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({ error: 'Too many attempts. Try again in 15 minutes.' }) });
  app.use('/session', (req, res, next) => req.method === 'POST' ? loginLimit(req, res, next) : next());
  app.use(express.json({ limit: '16kb', strict: true }));
  app.use((req, _res, next) => {
    if (['POST', 'PUT'].includes(req.method) && !object(req.body)) return next(new Problem(400, 'Supply a JSON object'));
    next();
  });
  app.get('/health', async (_req, res) => { await store.db.command({ ping: 1 }); res.json({ ok: true }); });
  app.get('/masjids', async (_req, res) => res.json(await store.listMasjids()));
  app.get('/masjids/:id/schedule', async (req, res) => res.json(await store.timetable(req.params.id)));
  app.post('/session', async (req, res) => res.json(await store.login(req.body)));
  app.delete('/session', async (req, res) => { await store.logout(bearer(req)); res.json({ ok: true }); });
  app.put('/masjids/:id/schedule', async (req, res) => res.json(await store.update(req.params.id, req.body, bearer(req))));
  app.use((_req, _res, next) => next(new Problem(404, 'Not found')));
  // Express 5 forwards rejected async handlers here. Never expose DB errors,
  // connection strings, passwords, tokens, audit entries or stack traces.
  app.use((error, _req, res, _next) => {
    if (error instanceof Problem) return res.status(error.status).json({ error: error.message });
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request' });
    if (error.status === 415) return res.status(415).json({ error: 'Unsupported content encoding' });
    res.status(500).json({ error: 'Server error' });
  });
  return app;
}
