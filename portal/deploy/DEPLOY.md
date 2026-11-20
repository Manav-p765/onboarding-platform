# Deploying the portal next to the CRM

Based on the server brief of 2026-11-19 (Ubuntu 24.04, Docker Compose, Caddy in a container, no Node on host).
**Every step marked ⚠ needs approval before it runs.**

## How it fits on the box

```
internet ──443──▶ Caddy (CRM's container, project aegislead-prod)
                    ├─ dashboard.aegislead.co ─▶ CRM frontend/backend   (unchanged)
                    └─ onboard.growmysecuritycompany.com   ─▶ onboard-app:3000       (via shared "edge" network)

/opt/onboard  (project "onboard", fully separate)
  ├─ app/            portal source (built into its own image, Node 22 inside the image)
  ├─ data/           SQLite DB, uploads, local backups
  ├─ .env            secrets (600)
  └─ docker-compose.yml
```

- No published ports, so nothing bypasses ufw. Caddy talks to the portal over a private Docker network.
- `mem_limit: 512m`, so the portal can never starve the CRM.
- Own SQLite DB, so the CRM's Postgres is never touched.
- No email is sent (agency decision), so nothing touches the CRM's Brevo setup.

## Steps

| # | Step | Who | CRM impact |
|---|---|---|---|
| 1 | Get VPS login (user arranges); ideally our own user with sudo + docker group | us | none |
| 2 | ⚠ `docker network create edge` | us | none |
| 3 | ⚠ Copy portal to `/opt/onboard/app`, write `.env`, `docker compose up -d --build` | us | none. Builds and starts only our container |
| 4 | Check the portal from inside the box: `docker exec onboard-app node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>r.text()).then(console.log)"` | us | none |
| 5 | ✅ DNS: `onboard.growmysecuritycompany.com` → 72.167.37.39 (live since 2026-11-19) | agency's DNS person | none |
| 6 | ⚠ CRM repo change: Caddyfile gets `import /etc/caddy/conf.d/*.caddy`; compose mounts `/opt/caddy-conf.d:/etc/caddy/conf.d:ro` and attaches caddy to external network `edge`. Put `onboard.caddy` in `/opt/caddy-conf.d/` | us on the server + **same change committed to the CRM repo** (CI overwrites the server Caddyfile/compose on every deploy) | **a few seconds of 502 while Caddy restarts** (`admin off` means no live reload) |
| 7 | Caddy issues the TLS cert automatically. Open `https://onboard.growmysecuritycompany.com/login` and create the admin | us | none |
| 8 | ⚠ Backups: cron at **03:15 UTC** (clear of the CRM's 20:30): `docker exec onboard-app node scripts/backup.mjs` | us | a few seconds of light I/O |
| 9 | Optional, recommended: 2 GB swapfile | us (root) | protects both apps |

## Updating the portal later

```bash
cd /opt/onboard && docker compose up -d --build   # only rebuilds/restarts onboard-app
```

## Rollback / removal

```bash
cd /opt/onboard && docker compose down              # portal stops; CRM unaffected
# remove /opt/caddy-conf.d/onboard.caddy on the next CRM deploy
```

## Never do (from the CRM brief)

- Any `docker compose` command inside `/opt/aegislead`
- `docker system prune -a` / `docker image prune -a` / `docker volume prune`
- Restart the `caddy` container without coordinating
- Add `ports:` to our compose file
- Touch `/opt/nydus`, the root backup cron, or `.env.production`
