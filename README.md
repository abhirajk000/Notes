# Secure Notes — Complete PWA

Zero-knowledge encrypted notes app. Apple Notes-inspired UI, client-side AES-GCM, Go blind-vault API.

**Repo:** [github.com/abhirajk000/Notes](https://github.com/abhirajk000/Notes.git)

## Architecture

| Layer | Tech | Host |
|-------|------|------|
| Frontend PWA | Next.js 15, Tailwind, Dexie, Web Workers, WebAuthn | Vercel |
| Backend API | Go 1.22, JWT cookies, Argon2id | Private VPS |
| Database | PostgreSQL (≤100 MB RAM profile) | Same VPS |

## Quick start

### VPS (Backend + PostgreSQL)

```bash
git clone https://github.com/abhirajk000/Notes.git /opt/secure-notes
cd /opt/secure-notes
sudo bash deploy/vps-setup.sh
sudo nano /etc/secure-notes/env   # JWT_SECRET, DATABASE_URL, CORS_ORIGINS
sudo systemctl start secure-notes-api
```

See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for full TLS, Caddy, and systemd setup.

### Vercel (Frontend)

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=https://api.yourdomain.com
npm install && npm run build
```

Set `BACKEND_URL=https://api.abhiraj.xyz` in Vercel → Environment Variables → redeploy.

## Project structure

```
Notes/
├── backend-go/          ← Production Go API (deploy this)
├── database/
│   ├── schema.sql       ← PostgreSQL schema
│   └── postgresql.conf  ← Low-memory tuning
├── deploy/              ← systemd, Caddy, VPS bootstrap
├── docs/DEPLOYMENT.md
└── frontend/            ← Next.js PWA (deploy to Vercel)
    ├── src/workers/crypto.worker.ts
    ├── src/lib/db.ts, syncManager.ts, biometrics.ts
    └── src/components/  ← AppShell, LockScreen, NoteEditor
```

## Security model

- **Zero-knowledge:** Server stores ciphertext + IV only
- **PBKDF2** 600k iterations → **AES-256-GCM** in Web Worker
- **Argon2id** login passwords (server-side auth only)
- **HttpOnly JWT** cookies with `Secure` + `SameSite=Strict`
- **WebAuthn PRF** biometric unlock (Face ID / Touch ID / Hello)
- **Auto-lock** after 2 min idle (switching apps does not lock immediately)

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account |
| POST | `/api/auth/login` | Login + encryption salt |
| GET | `/api/notes/meta` | Sync reconciliation metadata |
| POST | `/api/notes/sync` | Bulk UPSERT/delete (LWW) |
| POST | `/api/notes/batch` | Fetch ciphertext by IDs |

## Environment variables

| Variable | Where | Example |
|----------|-------|---------|
| `JWT_SECRET` | VPS | `openssl rand -hex 64` |
| `DATABASE_URL` | VPS | `postgresql://notes_user:...@127.0.0.1/notes_db` |
| `CORS_ORIGINS` | VPS | `https://notes.abhiraj.xyz` |
| `BACKEND_URL` | Vercel | `https://api.abhiraj.xyz` |

## License

Private / self-hosted. Use at your own risk — **lost master password = unrecoverable notes**.
