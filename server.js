import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as store from './db.js';
import { sendConfirmation } from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env when present (no dependency needed on Node ≥ 20.12). Variables
// already set in the shell take precedence.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  const before = { ...process.env };
  process.loadEnvFile(envFile);
  for (const k of Object.keys(before)) process.env[k] = before[k];
}

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '';

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Attribution captured client-side (UTM params + referrer) and sent along with
// signups and events. Everything is optional, trimmed and length-capped.
const clip = (v, max = 300) => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
};
function pickAttribution(body) {
  const a = body?.attribution && typeof body.attribution === 'object' ? body.attribution : {};
  const out = {};
  for (const f of store.ATTRIBUTION_FIELDS) out[f] = clip(a[f], f === 'referrer' ? 500 : 200);
  return out;
}

function isAdmin(req) {
  if (!ADMIN_PASSCODE) return false; // fail closed: never expose emails without a passcode
  const given = Buffer.from(String(req.get('x-admin-passcode') || ''));
  const want = Buffer.from(ADMIN_PASSCODE);
  return given.length === want.length && timingSafeEqual(given, want);
}

app.post('/api/signup', (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();

  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Please enter a valid email address.' });
  }
  if (email.length > 254) {
    return res.status(400).json({ error: 'That email address is too long.' });
  }

  const existing = store.findByEmail(email);
  if (existing) {
    return res.status(409).json({
      error: 'This email is already on the waitlist.',
      position: existing.position,
    });
  }

  const attribution = pickAttribution(req.body);
  const signup = store.add(email, attribution);
  store.recordEvent('signup', attribution);

  // Fire-and-forget: the signup response must not wait on the mail server.
  sendConfirmation(signup).catch((err) =>
    console.error(`[mail] Confirmation for ${email} failed:`, err.message)
  );

  res.status(201).json({ position: signup.position, total: store.total() });
});

// Client-side events (page_view, cta_click, example_view). The signup event is
// recorded server-side in /api/signup and is rejected here to keep counts honest.
app.post('/api/events', (req, res) => {
  const name = String(req.body?.name || '');
  if (!store.EVENT_NAMES.includes(name) || name === 'signup') {
    return res.status(400).json({ error: 'Unknown event.' });
  }
  store.recordEvent(name, pickAttribution(req.body));
  res.status(204).end();
});

app.get('/api/count', (_req, res) => {
  res.json({ total: store.total() });
});

app.get('/api/stats', (req, res) => {
  if (!ADMIN_PASSCODE) {
    return res.status(503).json({
      error: 'Admin stats are locked. Set ADMIN_PASSCODE on the server to enable the dashboard.',
      locked: true,
    });
  }
  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(store.stats());
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`RENiKA waitlist running at http://0.0.0.0:${PORT}`);
  console.log(`Admin dashboard:     http://0.0.0.0:${PORT}/admin.html`);
  if (!ADMIN_PASSCODE) {
    console.warn('[admin] ADMIN_PASSCODE is not set — /api/stats and the dashboard are locked until it is.');
  }
});
