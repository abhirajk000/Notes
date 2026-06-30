/**
 * Dexie.js — IndexedDB Database
 * ==============================
 * Defines the local offline storage schema. All data persisted here
 * is ciphertext — plaintext NEVER touches IndexedDB.
 *
 * Schema versioning: always add a new `version(N).stores(...)` block
 * when changing the schema; never mutate an existing version entry.
 */

import Dexie, { type Table } from 'dexie';
import type { LocalNote, SyncStatus } from '../types/notes';

class NotesDatabase extends Dexie {
  notes!: Table<LocalNote, string>; // primary key type = string (UUID)

  constructor() {
    super('SecureNotesDB');

    /**
     * Version 1 — initial schema.
     *
     * Index strategy:
     *  - `id`           → primary key (auto-indexed)
     *  - `sync_status`  → bulk queries for pending sync operations
     *  - `updated_at`   → ordered listing + LWW conflict resolution
     *  - `is_pinned`    → filter/sort by pinned status
     *
     * Fields not listed here (encrypted_title, encrypted_content, iv)
     * are stored but NOT indexed — you cannot search ciphertext anyway.
     */
    this.version(1).stores({
      notes: 'id, sync_status, updated_at, is_pinned',
    });
  }
}

// Singleton database instance — Dexie handles lazy connection opening.
export const db = new NotesDatabase();

// ── Query helpers ──────────────────────────────────────────────

/** Returns all notes ordered: pinned first, then by last-updated desc. */
export async function getAllNotes(): Promise<LocalNote[]> {
  return db.notes
    .orderBy('updated_at')
    .reverse()
    .toArray()
    .then((notes) =>
      notes.sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned)),
    );
}

/** Returns all notes that have not yet been pushed to the backend. */
export async function getPendingNotes(): Promise<LocalNote[]> {
  return db.notes
    .where('sync_status')
    .anyOf(['pending_create', 'pending_update', 'pending_delete'] satisfies SyncStatus[])
    .toArray();
}

/** Persists a new encrypted note locally and marks it for sync. */
export async function saveNote(note: Omit<LocalNote, 'sync_status' | 'created_at'>): Promise<void> {
  const existing = await db.notes.get(note.id);
  const status: SyncStatus = existing ? 'pending_update' : 'pending_create';
  await db.notes.put({
    ...note,
    created_at: existing?.created_at ?? note.updated_at,
    sync_status: status,
  });
}

/** Soft-deletes a note locally by marking it for deletion on next sync. */
export async function markForDeletion(id: string): Promise<void> {
  await db.notes.update(id, {
    sync_status: 'pending_delete' satisfies SyncStatus,
    updated_at: new Date().toISOString(),
  });
}

/** Hard-deletes a note from IndexedDB (called after confirmed server deletion). */
export async function hardDeleteNote(id: string): Promise<void> {
  await db.notes.delete(id);
}

/** Marks a note as synced (called after successful server acknowledgement). */
export async function markAsSynced(id: string): Promise<void> {
  await db.notes.update(id, { sync_status: 'synced' satisfies SyncStatus });
}

/**
 * Upserts a note received from the server (e.g. after a conflict resolution).
 * Always marks it as 'synced' since the server is the source of truth for
 * conflict-resolved records.
 */
export async function upsertFromServer(serverNote: Omit<LocalNote, 'sync_status'>): Promise<void> {
  await db.notes.put({ ...serverNote, sync_status: 'synced' });
}

/** Clears the entire local database (call on logout). */
export async function clearAllNotes(): Promise<void> {
  await db.notes.clear();
}
