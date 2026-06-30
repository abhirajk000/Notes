#!/usr/bin/env bash
# Pull latest code and restart the Go API on an existing VPS.
# Usage: sudo bash deploy/vps-update.sh
set -euo pipefail

APP_DIR=/opt/secure-notes

echo "==> Pulling latest code..."
cd "$APP_DIR"
git pull origin main

echo "==> Building Go API..."
cd "$APP_DIR/backend-go"
export PATH=$PATH:/usr/local/go/bin
make tidy && make build

echo "==> Applying schema updates (idempotent)..."
sudo -u postgres psql -d notes_db -f "$APP_DIR/database/schema.sql" || true

echo "==> Restarting API..."
systemctl restart secure-notes-api
sleep 2
systemctl status secure-notes-api --no-pager

echo "==> Health check..."
curl -sf http://127.0.0.1:4000/health && echo ""

echo "Done. Test public endpoint:"
echo "  curl -s https://api.abhiraj.xyz/health"
