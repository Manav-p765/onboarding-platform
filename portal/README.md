# Client Onboarding Portal

White-label portal: the agency creates a client and sends a private link. The client fills in their details and uploads files and logins (autosave).
The agency gets everything in one place, plus a Client Brief PDF for employees. See `../SPEC.md` for the full plan.

## Run locally

```bash
npm install
cp .env.example .env.local   # then set ENCRYPTION_KEY (command is in the file)
npm run dev                  # http://localhost:3000
```

The first visit to `/login` shows **First-time setup**, which creates the Super Admin account.
Email is off by design (no `SMTP_HOST`). Admins share links with the copy-message buttons. Exports: PDF per client, and Excel per client or for all clients.

## Tests

```bash
npm test            # everything (unit + browser), about 2 minutes
npm run test:unit   # 31 unit tests: encryption, 2-step codes, locking, change history, lockout
npm run test:e2e    # 20 browser tests on a real build with an empty database (needs: npx playwright install chromium)
```

The browser tests cover the full client and admin flows, plus attack attempts: no access without login,
forged sessions, other clients' files, bad upload types, locked sections, disabled links, lockout and 2-step login.
On failure, screenshots and traces are written to `test-results/`.

## Where things live

| What | Where |
|---|---|
| Form questions (Company Profile, Website, SEO, Social, GBP) | `src/lib/forms.ts`. Add or edit fields here. |
| Database (SQLite) | `$DATA_DIR/portal.db`, tables are created automatically |
| Uploaded files | `$DATA_DIR/uploads/<clientId>/` |
| Agency logo | `$DATA_DIR/brand/` |
| Client page | `src/app/c/[token]/` |
| Admin pages | `src/app/admin/` |
| PDFs | `src/lib/pdf.ts` |

## Production notes (VPS), pending approval

- Node 20+, `npm ci && npm run build`, run with PM2: `pm2 start npm --name onboard -- start -- -p 3100`
- `.env`: a fresh `ENCRYPTION_KEY` (**keep it out of backups**), `DATA_DIR=/var/www/onboard-data`, `APP_URL=https://onboard.<domain>`, SMTP settings
- The protected Credentials PDF needs `qpdf` (`apt install qpdf`)
- Reverse proxy `onboard.<domain>` → `127.0.0.1:3100`, with `client_max_body_size 200m;` for uploads
- Back up `DATA_DIR` nightly
