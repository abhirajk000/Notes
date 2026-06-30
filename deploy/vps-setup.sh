#!/usr/bin/env bash
# VPS bootstrap script — run as root on Ubuntu 22.04+
set -euo pipefail

APP_DIR=/opt/secure-notes
ENV_FILE=/etc/secure-notes/env

echo "==> Installing dependencies..."
apt-get update -qq
apt-get install -y postgresql postgresql-contrib git curl caddy

echo "==> Applying PostgreSQL low-memory config..."
cp "$APP_DIR/database/postgresql.conf" /etc/postgresql/*/main/conf.d/secure-notes.conf
systemctl restart postgresql

echo "==> Creating database..."
sudo -u postgres psql <<'SQL' || true
CREATE USER notes_user WITH PASSWORD 'CHANGE_ME_ON_FIRST_RUN';
CREATE DATABASE notes_db OWNER notes_user;
SQL
sudo -u postgres psql -d notes_db -f "$APP_DIR/database/schema.sql"

echo "==> Building Go API..."
cd "$APP_DIR/backend-go"
export PATH=$PATH:/usr/local/go/bin
make tidy && make build

echo "==> Installing systemd service..."
useradd -r -s /bin/false notes 2>/dev/null || true
cp "$APP_DIR/deploy/secure-notes-api.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable secure-notes-api

echo "==> Installing Caddy config..."
cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
systemctl reload caddy

echo ""
echo "Done. Next steps:"
echo "  1. Edit $ENV_FILE (JWT_SECRET, DATABASE_URL, CORS_ORIGINS)"
echo "  2. systemctl start secure-notes-api"
echo "  3. curl http://127.0.0.1:4000/health"
