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
import type { LocalVaultCard } from '../types/vault';

class NotesDatabase extends Dexie {
  notes!: Table<LocalNote, string>;
  cards!: Table<LocalVaultCard, string>;

  constructor() {
    super('SecureNotesDB');

    this.version(1).stores({
      notes: 'id, sync_status, updated_at, is_pinned',
    });

    this.version(2).stores({
      notes: 'id, sync_status, updated_at, is_pinned',
      cards: 'id, updated_at',
    });

    this.version(3).stores({
      notes: 'id, sync_status, updated_at, is_pinned, is_locked',
      cards: 'id, updated_at',
    });

    this.version(4).stores({
      notes: 'id, sync_status, updated_at, is_pinned, is_locked',
      cards: 'id, sync_status, updated_at',
    }).upgrade(async (tx) => {
      await tx.table('cards').toCollection().modify((card) => {
        if (!card.sync_status) {
          card.sync_status = 'pending_update';
        }
      });
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

export async function clearAllCards(): Promise<void> {
  await db.cards.clear();
}

/** Returns vault cards not yet pushed to the backend. */
export async function getPendingCards(): Promise<LocalVaultCard[]> {
  return db.cards
    .where('sync_status')
    .anyOf(['pending_create', 'pending_update', 'pending_delete'] satisfies SyncStatus[])
    .toArray();
}

/** Persists encrypted card locally and marks for server sync. */
export async function saveVaultCardRow(
  card: Omit<LocalVaultCard, 'sync_status' | 'created_at'>,
): Promise<void> {
  const existing = await db.cards.get(card.id);
  const status: SyncStatus = existing ? 'pending_update' : 'pending_create';
  await db.cards.put({
    ...card,
    created_at: existing?.created_at ?? card.updated_at,
    sync_status: status,
  });
}

export async function markCardForDeletion(id: string): Promise<void> {
  await db.cards.update(id, {
    sync_status: 'pending_delete' satisfies SyncStatus,
    updated_at: new Date().toISOString(),
  });
}

export async function hardDeleteCard(id: string): Promise<void> {
  await db.cards.delete(id);
}

export async function markCardAsSynced(id: string): Promise<void> {
  await db.cards.update(id, { sync_status: 'synced' satisfies SyncStatus });
}

export async function upsertCardFromServer(
  serverCard: Omit<LocalVaultCard, 'sync_status'>,
): Promise<void> {
  await db.cards.put({ ...serverCard, sync_status: 'synced' });
}
