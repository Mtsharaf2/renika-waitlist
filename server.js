import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as store from './db.js';
import { sendConfirmation } from './mailer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_PASSCODE = process.env.ADMIN_PASSCODE || '';

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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

  const signup = store.add(email);

  // Fire-and-forget: the signup response must not wait on the mail server.
  sendConfirmation(signup).catch((err) =>
    console.error(`[mail] Confirmation for ${email} failed:`, err.message)
  );

  res.status(201).json({ position: signup.position, total: store.total() });
});

app.get('/api/count', (_req, res) => {
  res.json({ total: store.total() });
});

app.get('/api/stats', (req, res) => {
  if (ADMIN_PASSCODE && req.get('x-admin-passcode') !== ADMIN_PASSCODE) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  res.json(store.stats());
});

app.listen(PORT, () => {
  console.log(`RENiKA waitlist running at http://localhost:${PORT}`);
  console.log(`Admin dashboard:     http://localhost:${PORT}/admin.html`);
  if (!ADMIN_PASSCODE) {
    console.warn('[admin] ADMIN_PASSCODE is not set — the dashboard is unprotected.');
  }
});
