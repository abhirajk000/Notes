/**
 * API Client
 * ==========
 * A typed, thin wrapper around `fetch` for all backend communication.
 *
 * All requests:
 *  - Use `credentials: 'include'` so the HTTP-only JWT cookie is sent.
 *  - Send `Content-Type: application/json` on mutations.
 *  - Throw `ApiError` on non-2xx responses, preserving the server's message.
 *
 * The base URL is read from NEXT_PUBLIC_API_URL at build time, falling back
 * to http://localhost:4000 for local development.
 */

import type { ServerNote } from '../types/notes';
import type { ServerVaultCard } from '../types/vault';

function resolveApiBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '');
  if (configured) return configured;
  // Production: same-origin /api/* proxied by Vercel or nginx to the Go backend
  if (typeof window !== 'undefined') return '';
  return 'http://localhost:4000';
}

const BASE = resolveApiBase();

// ── Error class ────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ── Internal fetch helper ──────────────────────────────────────────

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });

  const json = await res.json().catch(() => ({ ok: false, error: res.statusText }));

  if (!res.ok || !json.ok) {
    throw new ApiError(res.status, json.error ?? 'Unknown server error.', json.details);
  }

  return json.data as T;
}

// ── Shape types ────────────────────────────────────────────────────

export interface UserSession {
  id: string;
  username: string;
  encryption_salt: string;
  created_at: string;
}

export interface AuthResponse {
  user: UserSession;
}

export interface NoteMeta {
  id: string;
  updated_at: string;
}

export interface NoteMetaResponse {
  notes: NoteMeta[];
}

export interface NoteBatchResponse {
  notes: ServerNote[];
}

export interface SyncPayloadItem {
  id: string;
  encrypted_title?: string;
  encrypted_content?: string;
  iv?: string;
  is_pinned?: boolean;
  is_locked?: boolean;
  updated_at: string;
  deleted: boolean;
}

export interface SyncResponse {
  processed: string[];
  conflicts: ServerNote[];
  skipped: string[];
}

export interface VaultCardSyncPayloadItem {
  id: string;
  encrypted_title?: string;
  encrypted_content?: string;
  iv?: string;
  updated_at: string;
  deleted: boolean;
}

export interface VaultCardSyncResponse {
  processed: string[];
  conflicts: ServerVaultCard[];
  skipped: string[];
}

export interface VaultCardMetaResponse {
  cards: NoteMeta[];
}

export interface VaultCardBatchResponse {
  cards: ServerVaultCard[];
}

// ── Auth endpoints ─────────────────────────────────────────────────

export const auth = {
  register: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  logout: () =>
    request<{ message: string }>('/api/auth/logout', { method: 'POST' }),

  me: () =>
    request<AuthResponse>('/api/auth/me'),

  status: () =>
    request<{ registrationOpen: boolean; hasAccount: boolean; maxUsers: number }>('/api/auth/status'),
};

// ── Notes endpoints ────────────────────────────────────────────────

export const notes = {
  /** Full list — used for initial load or hard refresh. */
  list: () =>
    request<{ notes: ServerNote[] }>('/api/notes'),

  /**
   * Lightweight metadata for reconciliation: only {id, updated_at}.
   * Call this first during every sync cycle.
   */
  meta: () =>
    request<NoteMetaResponse>('/api/notes/meta'),

  /**
   * Batch-fetch full encrypted payloads for a specific set of note IDs.
   * Called after meta() to download only the notes that need updating locally.
   */
  batch: (ids: string[]) =>
    request<NoteBatchResponse>('/api/notes/batch', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  /**
   * Push local pending notes to the server.
   * The server applies LWW and returns processed/conflicts/skipped lists.
   */
  sync: (items: SyncPayloadItem[]) =>
    request<SyncResponse>('/api/notes/sync', {
      method: 'POST',
      body: JSON.stringify({ notes: items }),
    }),

  delete: (id: string) =>
    request<{ deleted: string }>(`/api/notes/${id}`, { method: 'DELETE' }),
};

// ── Vault card endpoints ───────────────────────────────────────────

export const vaultCards = {
  meta: () =>
    request<VaultCardMetaResponse>('/api/vault/cards/meta'),

  batch: (ids: string[]) =>
    request<VaultCardBatchResponse>('/api/vault/cards/batch', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),

  sync: (items: VaultCardSyncPayloadItem[]) =>
    request<VaultCardSyncResponse>('/api/vault/cards/sync', {
      method: 'POST',
      body: JSON.stringify({ cards: items }),
    }),

  delete: (id: string) =>
    request<{ deleted: string }>(`/api/vault/cards/${id}`, { method: 'DELETE' }),
};
