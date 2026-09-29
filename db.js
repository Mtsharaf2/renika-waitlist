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

  CREATE TABLE IF NOT EXISTS events (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    path          TEXT,
    referrer      TEXT,
    utm_source    TEXT,
    utm_medium    TEXT,
    utm_campaign  TEXT,
    utm_content   TEXT,
    utm_term      TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS events_name_created ON events (name, created_at);
`);

// Attribution columns on signups (added after the table's first release, so
// they are applied as idempotent ALTERs for existing databases).
export const ATTRIBUTION_FIELDS = [
  'referrer',
  'landing_path',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];
const existingCols = new Set(
  db.prepare('PRAGMA table_info(signups)').all().map((c) => c.name)
);
for (const col of ATTRIBUTION_FIELDS) {
  if (!existingCols.has(col)) db.exec(`ALTER TABLE signups ADD COLUMN ${col} TEXT`);
}

export const EVENT_NAMES = ['page_view', 'cta_click', 'signup', 'example_view'];

const insertSignup = db.prepare(`
  INSERT INTO signups (email, ${ATTRIBUTION_FIELDS.join(', ')})
  VALUES (?, ${ATTRIBUTION_FIELDS.map(() => '?').join(', ')})
`);

export function add(email, attribution = {}) {
  const info = insertSignup.run(email, ...ATTRIBUTION_FIELDS.map((f) => attribution[f] ?? null));
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

const insertEvent = db.prepare(`
  INSERT INTO events (name, path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

export function recordEvent(name, ctx = {}) {
  if (!EVENT_NAMES.includes(name)) throw new Error(`Unknown event: ${name}`);
  insertEvent.run(
    name,
    ctx.landing_path ?? ctx.path ?? null,
    ctx.referrer ?? null,
    ctx.utm_source ?? null,
    ctx.utm_medium ?? null,
    ctx.utm_campaign ?? null,
    ctx.utm_content ?? null,
    ctx.utm_term ?? null
  );
}

const dayKey = (offset) => {
  const d = new Date();
  d.setDate(d.getDate() - offset);
  return d.toISOString().slice(0, 10); // UTC day, matches date(created_at)
};

function eventCounts() {
  const rows = db
    .prepare(`
      SELECT name,
             COUNT(*) AS total,
             SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS today,
             SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week
      FROM events GROUP BY name
    `)
    .all();
  const byName = new Map(rows.map((r) => [r.name, r]));
  return EVENT_NAMES.map((name) => {
    const r = byName.get(name);
    return { name, total: r?.total || 0, today: r?.today || 0, week: r?.week || 0 };
  });
}

function signupSources() {
  return db
    .prepare(`
      SELECT COALESCE(utm_source, '') AS utm_source,
             COALESCE(utm_medium, '') AS utm_medium,
             COALESCE(utm_campaign, '') AS utm_campaign,
             COUNT(*) AS count
      FROM signups
      GROUP BY utm_source, utm_medium, utm_campaign
      ORDER BY count DESC, utm_source
    `)
    .all();
}

function topReferrers() {
  return db
    .prepare(`
      SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, COUNT(*) AS count
      FROM events WHERE name = 'page_view'
      GROUP BY 1 ORDER BY count DESC LIMIT 10
    `)
    .all();
}

export function stats() {
  const signups = db
    .prepare(`
      SELECT position, email, created_at, referrer, utm_source, utm_medium, utm_campaign
      FROM signups ORDER BY position DESC
    `)
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
    events: eventCounts(),
    sources: signupSources(),
    referrers: topReferrers(),
  };
}
