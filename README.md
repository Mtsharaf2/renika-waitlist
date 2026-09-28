# RENiKA — Waitlist

Coming-soon landing page for **RENiKA** — *Where renal evidence meets practice.*
Dark, startup-launch design with the signature kidney-pen animation (ported from
the RENiKA loading screen), email capture with waitlist positions, confirmation
emails, and an admin dashboard.

## Run

```bash
npm install
npm start          # http://localhost:3000
```

- **Landing page:** http://localhost:3000
- **Admin dashboard:** http://localhost:3000/admin.html

## Features

- **Landing page** — the kidney pen draws the "R", ENiKA slides in, the kidney
  lands as the dot of the "i" (loops gently, respects `prefers-reduced-motion`).
  Email capture returns the visitor's live position ("You are #47 on the
  waitlist") with a count-up reveal.
- **Confirmation email** — branded HTML email sent on every signup.
  Without SMTP config it uses an Ethereal test account and prints a preview URL
  to the server console; set `SMTP_*` env vars to send for real.
- **Admin dashboard** — total signups, today / last-7-days stats, a 30-day
  signups-over-time chart, and the full waitlist (position, email, timestamp).
  Protected by `ADMIN_PASSCODE` when set.

## Configuration

See [.env.example](.env.example). Copy to `.env` and restart.

| Variable          | Purpose                                                        |
| ----------------- | -------------------------------------------------------------- |
| `PORT`            | Server port (default 3000)                                     |
| `ADMIN_PASSCODE`  | Gate for `/admin.html` (empty = unprotected)                   |
| `MAIL_FROM`       | Confirmation email sender                                      |
| `SMTP_HOST`       | If unset, Ethereal test account is used (preview URLs logged)  |
| `SMTP_PORT`       | Default 587                                                    |
| `SMTP_SECURE`     | `true` for TLS (port 465)                                      |
| `SMTP_USER`       | SMTP username                                                  |
| `SMTP_PASS`       | SMTP password                                                  |

## API

| Method | Endpoint        | Description                                            |
| ------ | --------------- | ------------------------------------------------------ |
| POST   | `/api/signup`   | `{email}` → `201 {position, total}` · `409` if already on the list |
| GET    | `/api/count`    | Public total, for the landing-page counter             |
| GET    | `/api/stats`    | Dashboard data (requires `x-admin-passcode` header when `ADMIN_PASSCODE` is set) |

## Stack

Node.js + Express, SQLite via the built-in `node:sqlite` (no native deps),
nodemailer for email, vanilla HTML/CSS/JS frontend. Data lives in
`data/waitlist.db`.
