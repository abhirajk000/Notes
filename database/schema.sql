-- ============================================================
-- Secure Encrypted Notes — PostgreSQL Schema (Zero-Knowledge)
-- Run once on a fresh database:
--   createdb notes_db
--   psql -U notes_user -d notes_db -f schema.sql
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── users ─────────────────────────────────────────────────────
-- password_hash  → Argon2id login credential ONLY (never used for note encryption)
-- encryption_salt → public per-user salt; client uses it for PBKDF2 key derivation
CREATE TABLE IF NOT EXISTS users (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username         VARCHAR(64) NOT NULL UNIQUE,
    password_hash    TEXT        NOT NULL,
    encryption_salt  CHAR(64)    NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_username ON users (username);

-- ── notes ─────────────────────────────────────────────────────
-- Server stores ONLY ciphertext blobs. Plaintext never touches this table.
-- sync_status on server reflects committed vault state (always 'synced').
-- Client IndexedDB tracks pending_* states locally before flush.
CREATE TABLE IF NOT EXISTS notes (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_title   TEXT        NOT NULL DEFAULT '',
    encrypted_content TEXT        NOT NULL DEFAULT '',
    iv                TEXT        NOT NULL,
    sync_status       TEXT        NOT NULL DEFAULT 'synced'
                      CHECK (sync_status IN ('synced')),
    is_pinned         BOOLEAN     NOT NULL DEFAULT FALSE,
    is_locked         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated
    ON notes (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes (user_id);

-- Auto-maintain updated_at (server clock is authoritative for LWW)
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at ON notes;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON notes
    FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_updated_at();

-- ── vault_cards ───────────────────────────────────────────────────
-- Encrypted credit-card vault entries (same zero-knowledge model as notes).
CREATE TABLE IF NOT EXISTS vault_cards (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    encrypted_title   TEXT        NOT NULL DEFAULT '',
    encrypted_content TEXT        NOT NULL DEFAULT '',
    iv                TEXT        NOT NULL,
    sync_status       TEXT        NOT NULL DEFAULT 'synced'
                      CHECK (sync_status IN ('synced')),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_cards_user_updated
    ON vault_cards (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_vault_cards_user_id ON vault_cards (user_id);

DROP TRIGGER IF EXISTS set_updated_at ON vault_cards;
CREATE TRIGGER set_updated_at
    BEFORE UPDATE ON vault_cards
    FOR EACH ROW
    EXECUTE PROCEDURE trigger_set_updated_at();

-- ── grants (notes_user owns DB but tables created as postgres superuser) ──
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO notes_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO notes_user;
GRANT USAGE ON SCHEMA public TO notes_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO notes_user;
