# RENiKA — Waitlist

Coming-soon landing page for **RENiKA** — deterministic, auditable,
guideline-grounded CKD decision support for nephrologists and clinicians.
Dark, startup-launch design with the signature kidney-pen animation (ported from
the RENiKA loading screen), a worked clinical example (inputs → rule →
recommendation → citation), email capture with waitlist positions, confirmation
emails, first-party analytics, and a passcode-protected admin dashboard.

## Run locally (Node + SQLite)

```bash
npm install
cp .env.example .env   # set ADMIN_PASSCODE (required for the dashboard)
npm start              # http://localhost:3000
```

`.env` is loaded automatically at startup (variables already set in the shell win).

- **Landing page:** http://localhost:3000
- **Admin dashboard:** http://localhost:3000/admin.html

The local server continues to use `data/waitlist.db` and SMTP/Ethereal as
described below.

## Run locally as a Cloudflare Worker

```bash
npm install
npm run cf:migrate:local
npm run cf:dev                 # http://localhost:8788
```

Create `.dev.vars` (ignored by git) to unlock the local Worker dashboard:

```dotenv
ADMIN_PASSCODE=choose-a-local-passcode
```

The Worker uses a local D1 database under `.wrangler/`.

## Deploy to Cloudflare Workers + D1

Wrangler must first be authenticated (`npx wrangler login`, or set a scoped
`CLOUDFLARE_API_TOKEN`). Then:

```bash
npx wrangler d1 create renika-waitlist
# Put the returned database_id in wrangler.jsonc, replacing the all-zero local placeholder.
npx wrangler secret put ADMIN_PASSCODE
npm run cf:migrate:remote
npm run cf:deploy
```

Static files are served from the same Worker origin, and signups and analytics
are stored persistently in D1. `ADMIN_PASSCODE` is a Worker secret and must
never be added to `wrangler.jsonc` or frontend files.

Optional confirmation email delivery on Cloudflare uses Resend:

```bash
npx wrangler secret put RESEND_API_KEY
```

Set `MAIL_FROM` as a non-secret Worker variable only after verifying its domain
in Resend. Without `RESEND_API_KEY`, signups still work and the page accurately
says launch updates will be sent later.

## Features

- **Landing page** — the kidney pen draws the "R", ENiKA slides in, the kidney
  lands as the dot of the "i" (loops gently, respects `prefers-reduced-motion`).
  Email capture returns the visitor's live position ("You are #47 on the
  waitlist") with a count-up reveal.
- **Confirmation email** — branded HTML email sent on every signup.
  Without SMTP config it uses an Ethereal test account and prints a preview URL
  to the server console; set `SMTP_*` env vars to send for real.
- **Worked example** — a fictional CKD G3b A3 / type 2 diabetes case traced
  through RENiKA's output format: inputs, the rule that fired, the
  recommendation (SGLT2 inhibitor, KDIGO 2024 Rec 3.7.1) and the citation with
  guideline version. Labelled illustrative, not medical advice.
- **Analytics (first-party, no cookies)** — the landing page records
  `page_view`, `cta_click`, `example_view` (worked example scrolled into view)
  and, server-side, `signup`. UTM parameters (`utm_source|medium|campaign|content|term`,
  or `?source=` / `?ref=`), the external referrer and the landing path are
  captured on the visitor's first page of the session and stored with every
  event and signup. Nothing is sent to third parties.
- **Admin dashboard** — total signups, today / last-7-days stats, a 30-day
  signups-over-time chart, funnel event counts (total / 7 days / today /
  per page view), signup sources (UTM), top referrers, and the full waitlist
  (position, email, source, timestamp). Requires `ADMIN_PASSCODE`; without it
  the dashboard and `/api/stats` are locked, never open.

## Configuration

See [.env.example](.env.example). Copy to `.env` and restart.

| Variable          | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `PORT`            | Server port (default 3000)                                     |
| `ADMIN_PASSCODE`  | Gate for `/admin.html` and `/api/stats` (empty = locked, 503)  |
| `MAIL_FROM`       | Confirmation email sender                                      |
| `SMTP_HOST`       | If unset, Ethereal test account is used (preview URLs logged)  |
| `SMTP_PORT`       | Default 587                                                    |
| `SMTP_SECURE`     | `true` for TLS (port 465)                                      |
| `SMTP_USER`       | SMTP username                                                  |
| `SMTP_PASS`       | SMTP password                                                  |

## API

| Method | Endpoint        | Description                                            |
| ------ | --------------- | ------------------------------------------------------ |
| POST   | `/api/signup`   | `{email, attribution?}` → `201 {position, total}` · `409` if already on the list. Also records a `signup` event. |
| POST   | `/api/events`   | `{name, attribution?}` → `204`. `name` ∈ `page_view`, `cta_click`, `example_view` (`signup` is server-only). |
| GET    | `/api/count`    | Public total, for the landing-page counter             |
| GET    | `/api/stats`    | Dashboard data incl. `events`, `sources`, `referrers`, `signups` (emails). Requires `x-admin-passcode` header; `401` on a bad passcode, `503` when the server has no `ADMIN_PASSCODE`. |

`attribution` is an optional object with `referrer`, `landing_path`,
`utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
(strings; trimmed and length-capped server-side).

## Stack

- Production: Cloudflare Workers, static assets, and D1.
- Local Node option: Express, SQLite via built-in `node:sqlite`, and Nodemailer.
- Frontend: vanilla HTML/CSS/JS.
