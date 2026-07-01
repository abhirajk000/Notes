-- Add per-note lock flag (prevents accidental edits; syncs with client)
ALTER TABLE notes ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT FALSE;
