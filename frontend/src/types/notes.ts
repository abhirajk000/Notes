// ── Sync status values ─────────────────────────────────────────

export type SyncStatus = 'synced' | 'pending_create' | 'pending_update' | 'pending_delete';

// ── Local IndexedDB row (Dexie) ────────────────────────────────

export interface LocalNote {
  /** UUID — matches the server's `notes.id` */
  id: string;
  encrypted_title: string;
  encrypted_content: string;
  /** Base64-encoded 12-byte AES-GCM IV */
  iv: string;
  is_pinned: boolean;
  sync_status: SyncStatus;
  /** ISO-8601 string — used for Last-Write-Wins conflict resolution */
  updated_at: string;
  created_at: string;
}

// ── Plaintext note (in-memory only, never persisted) ──────────

export interface PlainNote {
  id: string;
  title: string;
  content: string;
  is_pinned: boolean;
  updated_at: string;
  created_at: string;
}

// ── Server note shape returned from GET /api/notes ────────────

export interface ServerNote {
  id: string;
  user_id: string;
  encrypted_title: string;
  encrypted_content: string;
  iv: string;
  sync_status?: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

// ── Sync request item sent to POST /api/notes/sync ────────────

export interface SyncItem {
  id: string;
  operation: 'upsert' | 'delete';
  encrypted_title?: string;
  encrypted_content?: string;
  iv?: string;
  is_pinned?: boolean;
  updated_at: string;
}

// ── Sync response from the backend ────────────────────────────

export interface SyncResult {
  processed: string[];
  conflicts: ServerNote[];
  skipped: string[];
}
