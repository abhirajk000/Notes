import type { Request } from 'express';

// ── Database row shapes ────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  password_hash: string;
  encryption_salt: string;
  created_at: Date;
}

export interface NoteRow {
  id: string;
  user_id: string;
  encrypted_title: string;
  encrypted_content: string;
  iv: string;
  is_pinned: boolean;
  created_at: Date;
  updated_at: Date;
}

// ── JWT payload ────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;   // user UUID
  iat?: number;
  exp?: number;
}

// ── Augmented Express request ──────────────────────────────────

export interface AuthenticatedRequest extends Request {
  user: JwtPayload;
}

// ── Sync operation types ───────────────────────────────────────

export type SyncOperation = 'upsert' | 'delete';

export interface SyncNoteItem {
  id: string;
  operation: SyncOperation;
  encrypted_title?: string;
  encrypted_content?: string;
  iv?: string;
  is_pinned?: boolean;
  /**
   * ISO-8601 timestamp from the client. Used for Last-Write-Wins
   * conflict resolution: if the server's `updated_at` is newer,
   * the server version wins and the client record is ignored.
   */
  updated_at: string;
}

// ── API response shapes ────────────────────────────────────────

export interface ApiSuccess<T = unknown> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string;
  details?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccess<T> | ApiError;
