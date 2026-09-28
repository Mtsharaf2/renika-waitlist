import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new DatabaseSync(path.join(dataDir, 'waitlist.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS signups (
    position    INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT NOT NULL UNIQUE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export function add(email) {
  const info = db.prepare('INSERT INTO signups (email) VALUES (?)').run(email);
  return { position: Number(info.lastInsertRowid), email };
}

export function findByEmail(email) {
  return db
    .prepare('SELECT position, email, created_at FROM signups WHERE email = ?')
    .get(email);
}

export function total() {
  return db.prepare('SELECT COUNT(*) AS c FROM signups').get().c;
}

const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10); // UTC day, matches date(created_at)
};

export function stats() {
  const signups = db
    .prepare('SELECT position, email, created_at FROM signups ORDER BY position DESC')
    .all();

  const rows = db
    .prepare("SELECT date(created_at) AS d, COUNT(*) AS c FROM signups GROUP BY date(created_at)")
    .all();
  const byDayMap = new Map(rows.map((r) => [r.d, r.c]));

  const byDay = [];
  for (let i = 29; i >= 0; i--) {
    const key = dayKey(i);
    byDay.push({ date: key, count: byDayMap.get(key) || 0 });
  }

  let week = 0;
  for (let i = 0; i < 7; i++) week += byDayMap.get(dayKey(i)) || 0;

  return {
    total: signups.length,
    today: byDayMap.get(dayKey(0)) || 0,
    week,
    byDay,
    signups,
  };
}
