# Phase 1 — VPS Backend Deployment Guide

Deploy the Go API + PostgreSQL on a private VPS. Frontend runs separately on [Vercel](https://vercel.com) (HTTPS required for Secure Context / WebAuthn).

Repository: [github.com/abhirajk000/Notes](https://github.com/abhirajk000/Notes.git)

---

## Architecture

```
┌─────────────────────┐         HTTPS + cookies         ┌──────────────────────┐
│  Vercel (Next.js)   │ ──────────────────────────────► │  VPS (Go API :4000)  │
│  Client-side crypto │ ◄────────────────────────────── │  Blind vault only    │
└─────────────────────┘                                 └──────────┬───────────┘
                                                                   │
                                                        ┌──────────▼───────────┐
                                                        │  PostgreSQL (local)  │
                                                        │  ~100 MB RAM budget  │
                                                        └──────────────────────┘
```

**Zero-knowledge rule:** The VPS never receives master passwords, derived AES keys, or plaintext notes.

---

## 1. VPS prerequisites

- Ubuntu 22.04+ (or Debian 12+)
- 1 vCPU / 1 GB RAM minimum (512 MB possible with tuning)
- Domain or subdomain pointing to VPS (e.g. `api.notes.example.com`)
- TLS termination via **Caddy** or **nginx** (required for `Secure` cookies in production)

```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib git curl
curl -fsSL https://go.dev/dl/go1.22.5.linux-amd64.tar.gz | sudo tar -C /usr/local -xz
echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.bashrc && source ~/.bashrc
```

---

## 2. PostgreSQL — low-memory profile

Copy the tuned config from the repo:

```bash
sudo cp database/postgresql.conf /etc/postgresql/*/main/conf.d/secure-notes.conf
sudo systemctl restart postgresql
```

Key settings (from `database/postgresql.conf`):

| Setting | Value | Purpose |
|---------|-------|---------|
| `shared_buffers` | 16MB | Primary cache |
| `work_mem` | 2MB | Per-sort/hash operation |
| `maintenance_work_mem` | 8MB | VACUUM / index builds |
| `max_connections` | 10 | Matches Go pool size |
| `effective_cache_size` | 32MB | Planner hint |

Create database + role:

```bash
sudo -u postgres psql <<'SQL'
CREATE USER notes_user WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
CREATE DATABASE notes_db OWNER notes_user;
GRANT ALL PRIVILEGES ON DATABASE notes_db TO notes_user;
SQL

sudo -u postgres psql -d notes_db -f /opt/secure-notes/database/schema.sql
```

---

## 3. Clone & build Go API

```bash
sudo mkdir -p /opt/secure-notes
sudo chown $USER:$USER /opt/secure-notes
git clone https://github.com/abhirajk000/Notes.git /opt/secure-notes
cd /opt/secure-notes/backend-go

cp .env.example .env   # edit before starting — see section 4
make tidy
make build             # produces bin/secure-notes-api
```

---

## 4. Environment variables (VPS)

Create `/etc/secure-notes/env` (mode `600`, owned by `notes` user):

```bash
sudo mkdir -p /etc/secure-notes
sudo nano /etc/secure-notes/env
```

```env
APP_ENV=production
PORT=4000

DATABASE_URL=postgresql://notes_user:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/notes_db?sslmode=disable

# Generate: openssl rand -hex 64
JWT_SECRET=PASTE_64_BYTE_HEX_HERE
JWT_EXPIRY=168h

# Your Vercel production URL — NO trailing slash, NO wildcard
CORS_ORIGINS=https://your-app.vercel.app

# Cookie domain = API hostname (or parent domain if using subdomains)
# Example: api.notes.example.com OR .notes.example.com
COOKIE_DOMAIN=api.notes.example.com
```

| Variable | VPS | Vercel |
|----------|-----|--------|
| `DATABASE_URL` | ✅ | ❌ never |
| `JWT_SECRET` | ✅ | ❌ never |
| `CORS_ORIGINS` | ✅ Vercel URL | — |
| `NEXT_PUBLIC_API_URL` | — | ✅ `https://api.notes.example.com` |

---

## 5. systemd service

```bash
sudo useradd -r -s /bin/false notes
sudo cp deploy/secure-notes-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now secure-notes-api
sudo systemctl status secure-notes-api
```

Health check:

```bash
curl -s http://127.0.0.1:4000/health
# {"ok":true,"ts":"..."}
```

---

## 6. TLS reverse proxy (Caddy example)

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```
api.notes.example.com {
    reverse_proxy 127.0.0.1:4000
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
    }
}
```

```bash
sudo systemctl reload caddy
```

---

## 7. Vercel frontend configuration

The frontend proxies API calls server-side (no browser CORS). In **Vercel → Project → Settings → Environment Variables**:

| Variable | Value | Environments |
|----------|-------|--------------|
| `BACKEND_URL` | `https://api.abhiraj.xyz` | Production, Preview, Development |

**Do not** set `NEXT_PUBLIC_API_URL` in production — the browser uses same-origin `/api/*`, and the Next.js server forwards to `BACKEND_URL`.

Redeploy after saving env vars:

```bash
cd frontend
vercel env add BACKEND_URL production   # paste: https://api.abhiraj.xyz
vercel --prod
```

Or trigger redeploy from the Vercel dashboard.

Verify from your machine:

```bash
curl -s https://api.abhiraj.xyz/health
# {"ok":true,"ts":"..."}

curl -s https://notes.abhiraj.xyz/api/auth/status
# {"ok":true,"data":{"registrationOpen":true,"maxUsers":1}}
```

If you see **502** or *"Cannot reach the notes API"* on Vercel, either `BACKEND_URL` is missing or the Go API on the VPS is down.

---

## 8. API endpoints (Phase 1)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/register` | — | Create user + set JWT cookie |
| `POST` | `/api/auth/login` | — | Authenticate + return `encryption_salt` |
| `POST` | `/api/auth/logout` | ✅ | Clear session cookie |
| `GET` | `/api/auth/me` | ✅ | Session heartbeat |
| `GET` | `/api/notes` | ✅ | Full encrypted note list |
| `GET` | `/api/notes/meta` | ✅ | `{id, updated_at}` for sync reconciliation |
| `POST` | `/api/notes/batch` | ✅ | Fetch ciphertext for specific IDs |
| `POST` | `/api/notes/sync` | ✅ | Bulk UPSERT / delete (LWW) |
| `DELETE` | `/api/notes/{id}` | ✅ | Hard delete single note |

### Sync payload example

```json
POST /api/notes/sync
{
  "notes": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "encrypted_title": "base64...",
      "encrypted_content": "base64...",
      "iv": "base64-12-byte-iv",
      "is_pinned": false,
      "updated_at": "2026-07-01T12:00:00.000Z",
      "deleted": false
    },
    {
      "id": "660e8400-e29b-41d4-a716-446655440001",
      "updated_at": "2026-07-01T12:05:00.000Z",
      "deleted": true
    }
  ]
}
```

**LWW SQL (server-side):**

```sql
ON CONFLICT (id) DO UPDATE SET ...
WHERE notes.user_id = $user_id
  AND EXCLUDED.updated_at > notes.updated_at
```

---

## 9. Security checklist

- [ ] `JWT_SECRET` is 64+ random bytes, never committed to git
- [ ] PostgreSQL listens on `127.0.0.1` only (`listen_addresses = 'localhost'`)
- [ ] UFW allows `22`, `80`, `443` — **not** port `4000` publicly
- [ ] `APP_ENV=production` enables `Secure` + `SameSite=Strict` cookies
- [ ] `CORS_ORIGINS` lists only your Vercel domain(s)
- [ ] VPS OS and Postgres receive regular security updates

---

## 10. Push to GitHub

```bash
cd /Users/abhiraj/Desktop/Notes   # or /opt/secure-notes after clone
git init
git remote add origin https://github.com/abhirajk000/Notes.git
git add .
git commit -m "Phase 1: Go backend, PostgreSQL schema, VPS deployment"
git push -u origin main
```

---

## Next phases

- **Phase 2:** Client crypto worker + Dexie.js + SyncManager (already in `frontend/src/`)
- **Phase 3:** Apple Notes UI + WebAuthn biometric lock (already in `frontend/src/`)

Proceed to Phase 2 when the VPS health check and a test login from Vercel succeed.
