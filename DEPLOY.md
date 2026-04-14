# SignProz: go live

The app is a single Node process: REST API + SQLite + static `public/index.html`.

## Local

1. Copy `.env.example` to `.env` and set `JWT_SECRET`, optional SMTP.
2. `npm install`
3. `npx prisma db push`
4. `npm start`
5. Open `http://localhost:3000` (not `file://` — the SPA must call the API on the same origin, or configure CORS and `API_BASE` in the frontend).

**Default admin (from `.env`):** `admin@signproz.local` / `ChangeMe123!` — change in production.

**Email / OTP:** Configure **Resend** (`RESEND_API_KEY`) or **SMTP** (`SMTP_HOST`, …). If neither is set, messages are printed to the server console only. See **Email** below.

## Email configuration

SignProz sends: **signup/login OTP**, **welcome** (after signup), and **document** notifications (workspace save / signers).

### Option A — Resend (recommended for quick setup)

1. Create a free account at [Resend](https://resend.com) and an **API key**.
2. For production, **verify a domain** and use e.g. `SignProz <noreply@yourdomain.com>` as `RESEND_FROM`.
3. For local tests only, you can use Resend’s sandbox sender: `SignProz <onboarding@resend.dev>` (can only send to your own verified recipient email in the Resend dashboard until a domain is verified).

In `.env`:

```env
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM=SignProz <onboarding@resend.dev>
```

Restart the server after changing `.env`.

### Option B — SMTP (Gmail, Outlook, SendGrid, …)

**Gmail**

1. Google Account → Security → **2-Step Verification** on.
2. **App passwords** → create an app password for “Mail”.
3. In `.env`:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=SignProz <you@gmail.com>
```

**Outlook / Microsoft 365**

```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=you@outlook.com
SMTP_PASS=your-password
SMTP_FROM=SignProz <you@outlook.com>
```

**SendGrid** (SMTP relay)

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
SMTP_FROM=SignProz <verified-sender@yourdomain.com>
```

If `RESEND_API_KEY` is set, **Resend takes priority** over SMTP.

## Docker

```bash
docker compose up --build
```

Persisted data: Docker volumes for `./data` and `./uploads`.

## Hosted VPS (Ubuntu example)

1. Install Node 20+, clone this folder, set `.env` with strong `JWT_SECRET` and real `APP_PUBLIC_URL` (your domain with `https`).
2. Use a process manager (systemd, PM2) to run `npm start`.
3. Put **Caddy** or **nginx** in front for TLS termination and reverse proxy to port 3000.
4. Configure SMTP (SendGrid, Mailgun, Amazon SES, etc.) so OTP and notifications deliver.

## PaaS (Render / Railway / Fly.io)

- **Build:** `npm install` then `npx prisma db push` (or use a release command).
- **Start:** `npm start`
- **Disk:** SQLite needs a persistent volume mounted at `data/` (and `uploads/`). Without a volume, data resets on each deploy.
- Set all env vars from `.env.example` in the provider’s dashboard.

## API overview

| Area | Routes |
|------|--------|
| Auth | `POST /api/auth/signup/request`, `POST /api/auth/signup/verify`, `POST /api/auth/login/request`, `POST /api/auth/login/verify` |
| User | `GET /api/user/me`, `POST /api/user/upgrade`, `POST /api/user/usage/signed-document` |
| Affiliate | `GET /api/affiliate/summary`, `GET /api/affiliate/referrals` |
| Documents | `GET /api/documents`, `POST /api/documents/workspace`, `POST /api/documents/upload`, `GET /api/documents/:id/download`, `DELETE /api/documents/:id` |
| Admin | `GET /api/admin/stats`, `GET /api/admin/users`, `GET /api/admin/documents`, `PATCH /api/admin/users/:id` |

All authenticated routes expect `Authorization: Bearer <token>`.
