# Deployment

How Peakwa's three apps are built, deployed and rolled back, and where each one runs.

> **Status (28 Sep 2026): mid-migration.** The two frontends are running on the frontend VPS, but **DNS has not been switched**. `site.peakwa.com` is still served by **Vercel**, and `dashboard.peakwa.com` does not exist in DNS yet (the dashboard is used at `ghl-backend-1qqr.vercel.app`). See [Cutover status](#cutover-status). Nothing here is finished until that section says so.

---

## What runs where

```
                        GitHub: devdazzlee/GHL-Backend-  (push to main)
                                        │
          ┌─────────────────────────────┼──────────────────────────────┐
          │ backend/**                  │ dashboard/**                  │ peakwa-sites/**
          ▼                             ▼                               ▼
 deploy-backend.yml          deploy-dashboard-vps.yml       deploy-peakwa-sites-vps.yml
          │                             │                               │
          ▼                             └───────────────┬───────────────┘
 BACKEND VPS 187.77.19.146                              ▼
 (Richie's, 1 vCPU)                     FRONTEND VPS 169.58.4.58
 backend.peakwa.com                     (Contabo, 6 cores, 12 GB, shared)
 PM2: gbp-backend :4000                 nginx → dashboard.peakwa.com  (static files)
 /var/www/GHL-Backend-                  nginx → site.peakwa.com → systemd peakwa-sites :3100
```

| App | Repo folder | Server | Hostname | Runs as | Listens on |
|---|---|---|---|---|---|
| Backend API | `backend/` | **187.77.19.146** (backend VPS) | `backend.peakwa.com` | PM2 process `gbp-backend` | `127.0.0.1:4000` (behind nginx) |
| Admin dashboard | `dashboard/` | **169.58.4.58** (frontend VPS) | `dashboard.peakwa.com` *(not in DNS yet)* | nginx static files | nginx :80 (:443 after certificate) |
| Generated sites (renderer) | `peakwa-sites/` | **169.58.4.58** (frontend VPS) | `site.peakwa.com` *(DNS still on Vercel)* | systemd `peakwa-sites.service` | `127.0.0.1:3100` (behind nginx) |

Both frontends call the backend at `https://backend.peakwa.com`; the backend stays where it is.

Vercel still builds and serves both frontends on every push to `main` (projects `ghl-backend-eopr` = sites, `ghl-backend-1qqr` = dashboard). That continues until the cutover is done and Vercel is disconnected.

### ⚠️ The frontend VPS is shared: do not touch other apps

`169.58.4.58` also runs **unrelated client apps**. Anything done for Peakwa must never modify, restart or reconfigure them:

- **Readsy**: `readsy-api.service`, `/var/www/readsy`, nginx `readsy`, `readsy-ip`
- **Wholesale Nuts**: `wholesale-api.service`, `/var/www/wholesale`, nginx `wholesale`, `wholesale-pos`
- **Ace Studios UK**: `ace-studios-uk-api.service`, `/var/www/ace-studios-uk`
- **Ace Studios USA**: `ace-studios-usa-api.service`, `/var/www/ace-studios-usa`
- **Sarwat Traders POS**: `sarwat-api.service`, `/var/www/sarwat`, nginx `sarwat-pos`, `sarwat-pos-domain`
- **Minlopro**: `minlopro-api.service`, `/var/www/minlopro`
- plus static sites Markhor Events and Ace of Ace (`/var/www/markhor-events`, `/var/www/acesoface`)
- plus the shared PostgreSQL (`postgresql@16-main`, port 5432), used by those apps, not by Peakwa

Rules:

- Peakwa only owns:
  - `/var/www/peakwa-sites`, `/var/www/peakwa-dashboard`;
  - `/etc/systemd/system/peakwa-sites.service`, `/etc/peakwa-sites.env`;
  - `/etc/nginx/sites-available/peakwa-sites` and `/etc/nginx/sites-available/peakwa-dashboard`, plus their `sites-enabled` links.
- nginx is shared. Always run `nginx -t` first, then `systemctl reload nginx` (graceful). Never `restart` it, never edit another app's site file.
- Ports in use by other apps: 3001, 3002, 4000, 5000, 5001, 5432, 8080–8086, 9000. Peakwa uses 3100.
- `peakwa-sites.service` is capped (`MemoryMax=1536M`, `CPUQuota=300%`) so it can't starve the others.

---

## The three pipelines

Each workflow has its **own path filter and its own concurrency group**, so they are independent.
- **Combined push:** one push that changes several folders starts every matching workflow. Verified 28 Sep 2026: a single commit changing `backend/`, `dashboard/` and `peakwa-sites/` started all three.
- **Single-folder push:** a change to one folder starts only that folder's workflow. A push touching none of the three starts nothing.
- **GitHub limit:** path filters only look at the first 300 changed files of a push. A push with more than 300 changed files may skip a workflow. Keep deploy pushes small, or start the workflow manually (below).

### 1. Backend → backend VPS: `.github/workflows/deploy-backend.yml`

- **Triggers:**
  - push to `main` touching `backend/**` or the workflow file;
  - manual run (Actions → "Deploy Backend to VPS" → Run workflow).
- **Secrets:** `VPS_HOST` (187.77.19.146), `VPS_USER`, `VPS_SSH_KEY`.
- **Concurrency:** group `deploy-backend`, `cancel-in-progress: true`. A newer backend push cancels an older backend run that's still going.
- **Steps (run over SSH on the server):**
  1. `cd /var/www/GHL-Backend-`, then `git fetch origin main` and `git reset --hard origin/main`. It always deploys **the current `main`**, not the commit that started the run.
  2. `cd backend`, then check `.env` exists. `.env` lives only on the server and is never in git.
  3. `npm install --omit=dev`, then `npx prisma generate`, then `npx prisma db push` (applies additive schema changes).
  4. `pm2 restart gbp-backend --update-env`.
  5. **Health check:** poll `http://127.0.0.1:4000/health` for up to 30 s. If it fails, print the last 40 log lines and fail the run.
- **No release folders and no automatic rollback.** A failed health check fails the run but leaves the new code in place. See [Rollback → backend](#backend-187771914).
- **Known:** an SSH connect timeout from GitHub to this VPS happened once (27 Sep 2026). It failed before touching the server, and a re-run succeeded. If it recurs, check the VPS firewall and network first.

### 2. Dashboard → frontend VPS: `.github/workflows/deploy-dashboard-vps.yml`

- **Triggers:**
  - push to `main` touching `dashboard/**` or the workflow file;
  - manual run.
- **Secrets:** `FRONTEND_VPS_HOST` (169.58.4.58), `FRONTEND_VPS_USER` (root), `FRONTEND_VPS_SSH_KEY` (a dedicated deploy key, comment `github-actions@ghl-backend-frontends`), and `FRONTEND_VPS_KNOWN_HOSTS` (the pinned server host key).
- **Concurrency:** group `deploy-dashboard-vps`, never cancels a running deploy.
- **Steps:**
  1. **Build on the GitHub runner**, never on the server: Node 22, `npm ci`, then `npm run build` (`tsc -b && vite build`) → `dist/`. API and site URLs come from `dashboard/src/config/config.ts` as committed.
  2. Package `dist/` as a tarball, then `scp` it to `/tmp` on the server.
  3. Unpack into a new release folder `/var/www/peakwa-dashboard/releases/<commit sha>/`.
  4. Switch `/var/www/peakwa-dashboard/current` → the new release (symlink). nginx serves `current`, so no restart is needed.
  5. **Check:** request a deep route of `https://dashboard.peakwa.com` from the server itself (`--resolve` to 127.0.0.1). It must return the app page (`id="root"`).
  6. **Automatic rollback:** if the check fails, `current` is pointed back at the previous release and the run fails.
  7. Keep the 5 newest releases; delete older ones.

### 3. Generated sites → frontend VPS: `.github/workflows/deploy-peakwa-sites-vps.yml`

- **Triggers:**
  - push to `main` touching `peakwa-sites/**` or the workflow file;
  - manual run.
- **Secrets:** the same four `FRONTEND_VPS_*` secrets.
- **Concurrency:** group `deploy-peakwa-sites-vps`, never cancels a running deploy.
- **Steps:**
  1. **Build on the GitHub runner:** Node 22, `npm ci`, `npm test`, then `npm run build` with `NEXT_OUTPUT_STANDALONE=1`. That produces a self-contained Next.js server in `.next/standalone`. The flag is only set here, so Vercel builds are unaffected.
  2. Copy `.next/static` and `public/` into the standalone folder, package it as a tarball, and `scp` it to the server.
  3. Unpack into `/var/www/peakwa-sites/releases/<commit sha>/`, then switch `/var/www/peakwa-sites/current` → it.
  4. `systemctl restart peakwa-sites`.
  5. **Health check:** poll `http://127.0.0.1:3100/` with `Host: site.peakwa.com` for up to 40 s. It must return 200.
  6. **Automatic rollback:** if it never returns 200, print the service log, point `current` back at the previous release, restart the service, and fail the run.
  7. Keep the 5 newest releases.
- **Runtime settings** are in `/etc/peakwa-sites.env` on the server: root-only, not in git.
  - Contents: `NODE_ENV`, `PORT=3100`, `HOSTNAME=127.0.0.1`, `SITE_RENDERER_API_KEY`, `REVALIDATE_SECRET`.
  - The last two must match the backend's values.
  - Production URLs default to `https://site.peakwa.com` / `https://backend.peakwa.com` (see `peakwa-sites/src/config/defaults.ts`).

---

## Manual deploy (re-run, or GitHub Actions is down)

**Re-run through GitHub:** Actions → pick the workflow → **Run workflow** on `main`. Or with the CLI:

```bash
gh workflow run deploy-peakwa-sites-vps.yml --ref main --repo devdazzlee/GHL-Backend-
gh workflow run deploy-dashboard-vps.yml   --ref main --repo devdazzlee/GHL-Backend-
gh workflow run deploy-backend.yml         --ref main --repo devdazzlee/GHL-Backend-
```

**Without GitHub Actions**, from a machine with SSH access (frontend VPS: `ssh root@169.58.4.58` with an authorized key):

```bash
# Generated sites
cd peakwa-sites && npm ci && NEXT_OUTPUT_STANDALONE=1 npm run build
cp -r .next/static .next/standalone/.next/static && cp -r public .next/standalone/public
tar -czf /tmp/peakwa-sites.tgz -C .next/standalone .
REL=manual-$(date +%Y%m%d%H%M%S)
scp /tmp/peakwa-sites.tgz root@169.58.4.58:/tmp/
ssh root@169.58.4.58 "mkdir -p /var/www/peakwa-sites/releases/$REL && tar -xzf /tmp/peakwa-sites.tgz -C /var/www/peakwa-sites/releases/$REL && ln -sfn /var/www/peakwa-sites/releases/$REL /var/www/peakwa-sites/current && systemctl restart peakwa-sites && sleep 3 && curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: site.peakwa.com' http://127.0.0.1:3100/"

# Dashboard
cd dashboard && npm ci && npm run build && tar -czf /tmp/peakwa-dashboard.tgz -C dist .
REL=manual-$(date +%Y%m%d%H%M%S)
scp /tmp/peakwa-dashboard.tgz root@169.58.4.58:/tmp/
ssh root@169.58.4.58 "mkdir -p /var/www/peakwa-dashboard/releases/$REL && tar -xzf /tmp/peakwa-dashboard.tgz -C /var/www/peakwa-dashboard/releases/$REL && ln -sfn /var/www/peakwa-dashboard/releases/$REL /var/www/peakwa-dashboard/current"
```

Backend without Actions (needs SSH access to 187.77.19.146; that's Richie's server, so coordinate first):

```bash
ssh <user>@187.77.19.146
cd /var/www/GHL-Backend- && git fetch origin main && git reset --hard origin/main
cd backend && npm install --omit=dev && npx prisma generate && npx prisma db push
pm2 restart gbp-backend --update-env && curl -fs http://127.0.0.1:4000/health
```

---

## Rollback

### Generated sites (peakwa-sites, 169.58.4.58)

Every deploy is a folder, so rolling back means pointing `current` at an older one:

```bash
ssh root@169.58.4.58
ls -1dt /var/www/peakwa-sites/releases/*          # newest first; the 2nd line is the previous release
ln -sfn /var/www/peakwa-sites/releases/<previous-sha> /var/www/peakwa-sites/current
systemctl restart peakwa-sites
curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: site.peakwa.com' http://127.0.0.1:3100/   # expect 200
```

The next push to `main` touching `peakwa-sites/` deploys again, so also revert the bad commit on `main`.

### Dashboard (169.58.4.58)

```bash
ssh root@169.58.4.58
ls -1dt /var/www/peakwa-dashboard/releases/*
ln -sfn /var/www/peakwa-dashboard/releases/<previous-sha> /var/www/peakwa-dashboard/current
# no restart needed; nginx serves the new target immediately
```

### Backend (187.77.19.146)

The backend deploys whatever is on `main`, so the normal rollback is to **revert on `main`**. The revert commit touches `backend/`, so the workflow redeploys automatically:

```bash
git revert <bad-commit> && git push origin main
```

In an emergency, from the server (Richie's VPS):

```bash
cd /var/www/GHL-Backend- && git reset --hard <good-sha>
cd backend && npm install --omit=dev && npx prisma generate
pm2 restart gbp-backend --update-env && curl -fs http://127.0.0.1:4000/health
```

Schema changes so far are additive only (new tables and nullable columns), so older code runs fine on the newer schema. Don't run `prisma db push` from an older commit: it would try to drop the newer tables and columns.

### Vercel (until the cutover is finished)

Vercel keeps every deployment. In the Vercel dashboard, open project `ghl-backend-eopr` (sites) or `ghl-backend-1qqr` (dashboard) → Deployments → pick an older one → **Promote to Production**.

---

## Cutover status

**As of 28 Sep 2026, not started. Each DNS step needs explicit approval.**

| Hostname | Today | Target | Status |
|---|---|---|---|
| `site.peakwa.com` | CNAME `0f23cae859592004.vercel-dns-017.com.` (**Vercel**), TTL 14400 | A `169.58.4.58` | **Not switched.** The VPS copy passed a parity test: 291/291 URLs across all 14 sites matched Vercel. |
| `dashboard.peakwa.com` | A `169.58.4.58` (added 28 Sep 2026) | same | **DNS live; HTTPS certificate issued (Certbot, auto-renewing).** Still needs `DASHBOARD_URL=https://dashboard.peakwa.com` in the backend `.env` (CORS). |

DNS for `peakwa.com` is at Hostinger (nameservers `ns1/ns2.dns-parking.com`). Both new nginx sites on the VPS are **HTTP only** until certificates are issued.

Planned steps, each only after approval:

1. **`site.peakwa.com`, lower the TTL:** at least 4 h ahead, lower the existing `site` CNAME TTL to 300.
2. **`site.peakwa.com`, certificate before the switch:** issue a Let's Encrypt certificate using a DNS TXT record (`_acme-challenge.site`), so HTTPS works the moment traffic arrives.
3. **`site.peakwa.com`, switch:** delete CNAME `site` → `0f23cae859592004.vercel-dns-017.com.`, add A `site` → `169.58.4.58` (TTL 300).
4. **`site.peakwa.com`, after the switch:**
   - re-issue the certificate with `certbot --nginx -d site.peakwa.com`, so renewals are automatic;
   - re-run the parity test over HTTPS.
5. **`site.peakwa.com`, rollback:** delete the A record and re-add CNAME `site` → `0f23cae859592004.vercel-dns-017.com` (TTL 300). Keep Vercel deployed for 1–2 weeks after the switch.
6. **`dashboard.peakwa.com`:**
   1. Add A `dashboard` → `169.58.4.58`. It's a new name, so nothing live is affected.
   2. Run `certbot --nginx -d dashboard.peakwa.com`.
   3. Set `DASHBOARD_URL` on the backend and restart it.
7. **Once both are live and stable:** disconnect the Vercel projects from the repo, so pushes stop deploying there.

Until step 3, the backend's cache refreshes (`SITE_FRONTEND_URL=https://site.peakwa.com`) reach only Vercel, so the VPS copy of the sites can be up to 1 hour behind.

---

## Related

- `GENERATOR-GAPS-REPORT.md` (outside this repo) has the feature history and acceptance results.
- Custom domains for generated sites (planned) will use this frontend VPS: nginx + Certbot per client domain.
