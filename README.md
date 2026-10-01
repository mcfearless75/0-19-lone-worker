# 0-19 Lone Worker

Phone-first lone worker web app (installable PWA). Hold Red Alert, release, and the
server instantly messages up to 8 duty mobiles by WhatsApp and up to 8 addresses by
email, and pins the worker on the team board.

Stack: TanStack Start (React) running as a Node server on Railway, Postgres via `DATABASE_URL`. Migrations run on start (`npm start`).

## Environment variables (set in Railway, never commit)

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string. Without it the app falls back to an in-memory database that resets on restart. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | Meta WhatsApp Cloud API |
| `WHATSAPP_TEMPLATE` | Approved template with 3 body variables (worker, detail, where). Default `lone_worker_alert` |
| `RESEND_API_KEY`, `ALERT_EMAIL_FROM` | Resend email, e.g. `Lone Worker <alerts@yourdomain.co.uk>` |

## Commands

```bash
npm install
npm run dev        # http://localhost:8080
npm test
npm run typecheck
npm run build
npm start          # applies migrations/ then serves on $PORT
```
