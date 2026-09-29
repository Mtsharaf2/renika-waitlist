const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EVENT_NAMES = ['page_view', 'cta_click', 'signup', 'example_view'];
const ATTRIBUTION_FIELDS = [
  'referrer',
  'landing_path',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
];

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });

const clip = (value, max = 300) => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
};

function pickAttribution(body) {
  const input =
    body?.attribution && typeof body.attribution === 'object' ? body.attribution : {};
  return Object.fromEntries(
    ATTRIBUTION_FIELDS.map((field) => [
      field,
      clip(input[field], field === 'referrer' ? 500 : 200),
    ])
  );
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 10_240) throw new Error('PAYLOAD_TOO_LARGE');
  return request.json();
}

async function secureEqual(given, expected) {
  const encoder = new TextEncoder();
  const [givenHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(given)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const left = new Uint8Array(givenHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let i = 0; i < left.length; i += 1) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function recordEvent(db, name, attribution) {
  await db
    .prepare(
      `INSERT INTO events
       (name, path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      name,
      attribution.landing_path,
      attribution.referrer,
      attribution.utm_source,
      attribution.utm_medium,
      attribution.utm_campaign,
      attribution.utm_content,
      attribution.utm_term
    )
    .run();
}

async function sendConfirmation(env, email, position) {
  if (!env.RESEND_API_KEY) return;

  const from = env.MAIL_FROM || 'RENiKA <hello@renika.health>';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: `You're on the RENiKA waitlist — #${position}`,
      text:
        `You're on the RENiKA waitlist.\n\n` +
        `Your email ${email} is confirmed for early access. Your position is #${position}.\n\n` +
        `We'll email you as soon as your invite is ready. No spam — just the launch.\n\n` +
        `RENiKA — Where renal evidence meets practice.`,
    }),
  });
  if (!response.ok) {
    throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
  }
}

async function signup(request, env, ctx) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return json(
      {
        error:
          error.message === 'PAYLOAD_TOO_LARGE'
            ? 'Request is too large.'
            : 'Invalid JSON request.',
      },
      error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400
    );
  }

  const email = String(body?.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ error: 'Please enter a valid email address.' }, 400);
  if (email.length > 254) return json({ error: 'That email address is too long.' }, 400);

  const existing = await env.DB.prepare(
    'SELECT position FROM signups WHERE email = ?'
  ).bind(email).first();
  if (existing) {
    return json(
      {
        error: 'This email is already on the waitlist.',
        position: Number(existing.position),
      },
      409
    );
  }

  const attribution = pickAttribution(body);
  let result;
  try {
    result = await env.DB.prepare(
      `INSERT INTO signups
       (email, referrer, landing_path, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(email, ...ATTRIBUTION_FIELDS.map((field) => attribution[field]))
      .run();
  } catch (error) {
    if (String(error).toLowerCase().includes('unique')) {
      const duplicate = await env.DB.prepare(
        'SELECT position FROM signups WHERE email = ?'
      ).bind(email).first();
      return json(
        {
          error: 'This email is already on the waitlist.',
          position: Number(duplicate.position),
        },
        409
      );
    }
    throw error;
  }

  const position = Number(result.meta.last_row_id);
  const followups = [
    recordEvent(env.DB, 'signup', attribution),
    sendConfirmation(env, email, position).catch((error) =>
      console.error(`[mail] Confirmation for ${email} failed:`, error.message)
    ),
  ];
  ctx.waitUntil(Promise.all(followups));

  const total = await env.DB.prepare('SELECT COUNT(*) AS count FROM signups').first();
  return json(
    {
      position,
      total: Number(total.count),
      confirmation: env.RESEND_API_KEY ? 'configured' : 'not_configured',
    },
    201
  );
}

async function events(request, env) {
  let body;
  try {
    body = await readJson(request);
  } catch (error) {
    return json(
      { error: error.message === 'PAYLOAD_TOO_LARGE' ? 'Request is too large.' : 'Invalid JSON request.' },
      error.message === 'PAYLOAD_TOO_LARGE' ? 413 : 400
    );
  }

  const name = String(body?.name || '');
  if (!EVENT_NAMES.includes(name) || name === 'signup') {
    return json({ error: 'Unknown event.' }, 400);
  }
  await recordEvent(env.DB, name, pickAttribution(body));
  return new Response(null, { status: 204 });
}

function utcDay(offset = 0) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - offset);
  return date.toISOString().slice(0, 10);
}

async function stats(request, env) {
  if (!env.ADMIN_PASSCODE) {
    return json(
      {
        error: 'Admin stats are locked. Configure the ADMIN_PASSCODE Worker secret.',
        locked: true,
      },
      503
    );
  }
  const passcode = request.headers.get('x-admin-passcode') || '';
  if (!(await secureEqual(passcode, env.ADMIN_PASSCODE))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const [signupsResult, daysResult, eventsResult, sourcesResult, referrersResult] =
    await env.DB.batch([
      env.DB.prepare(
        `SELECT position, email, created_at, referrer, utm_source, utm_medium, utm_campaign
         FROM signups ORDER BY position DESC`
      ),
      env.DB.prepare(
        `SELECT date(created_at) AS date, COUNT(*) AS count
         FROM signups GROUP BY date(created_at)`
      ),
      env.DB.prepare(
        `SELECT name,
                COUNT(*) AS total,
                SUM(CASE WHEN date(created_at) = date('now') THEN 1 ELSE 0 END) AS today,
                SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS week
         FROM events GROUP BY name`
      ),
      env.DB.prepare(
        `SELECT COALESCE(utm_source, '') AS utm_source,
                COALESCE(utm_medium, '') AS utm_medium,
                COALESCE(utm_campaign, '') AS utm_campaign,
                COUNT(*) AS count
         FROM signups
         GROUP BY utm_source, utm_medium, utm_campaign
         ORDER BY count DESC, utm_source`
      ),
      env.DB.prepare(
        `SELECT COALESCE(NULLIF(referrer, ''), '(direct)') AS referrer, COUNT(*) AS count
         FROM events WHERE name = 'page_view'
         GROUP BY 1 ORDER BY count DESC LIMIT 10`
      ),
    ]);

  const dayCounts = new Map(daysResult.results.map((row) => [row.date, Number(row.count)]));
  const byDay = Array.from({ length: 30 }, (_, index) => {
    const date = utcDay(29 - index);
    return { date, count: dayCounts.get(date) || 0 };
  });
  const eventCounts = new Map(eventsResult.results.map((row) => [row.name, row]));
  const eventData = EVENT_NAMES.map((name) => {
    const row = eventCounts.get(name);
    return {
      name,
      total: Number(row?.total || 0),
      today: Number(row?.today || 0),
      week: Number(row?.week || 0),
    };
  });

  return json({
    total: signupsResult.results.length,
    today: dayCounts.get(utcDay()) || 0,
    week: Array.from({ length: 7 }, (_, index) => dayCounts.get(utcDay(index)) || 0).reduce(
      (sum, count) => sum + count,
      0
    ),
    byDay,
    signups: signupsResult.results,
    events: eventData,
    sources: sourcesResult.results.map((row) => ({ ...row, count: Number(row.count) })),
    referrers: referrersResult.results.map((row) => ({ ...row, count: Number(row.count) })),
  });
}

async function handleApi(request, env, ctx, pathname) {
  if (pathname === '/api/signup' && request.method === 'POST') return signup(request, env, ctx);
  if (pathname === '/api/events' && request.method === 'POST') return events(request, env);
  if (pathname === '/api/count' && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT COUNT(*) AS count FROM signups').first();
    return json({ total: Number(row.count) });
  }
  if (pathname === '/api/stats' && request.method === 'GET') return stats(request, env);
  return json({ error: 'Not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith('/api/')) return await handleApi(request, env, ctx, pathname);

      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      headers.set('x-content-type-options', 'nosniff');
      headers.set('referrer-policy', 'strict-origin-when-cross-origin');
      headers.set('x-frame-options', 'DENY');
      headers.set(
        'content-security-policy',
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
      );
      return new Response(response.body, { status: response.status, headers });
    } catch (error) {
      console.error(error);
      return json({ error: 'Internal server error.' }, 500);
    }
  },
};
