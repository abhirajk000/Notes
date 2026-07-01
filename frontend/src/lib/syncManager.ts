/**
 * SyncManager v2 — Full Reconciliation Engine
 * =============================================
 * Implements a four-phase sync pulse that keeps local IndexedDB and the
 * Go backend in sync while respecting the zero-knowledge constraint:
 * the server never receives or stores the master key.
 *
 * ─── Sync Pulse Phases ────────────────────────────────────────────
 *
 * Phase 1 — FETCH META
 *   GET /api/notes/meta → server sends [{id, updated_at}] for all notes.
 *   No ciphertext is transferred here — only timestamps for reconciliation.
 *
 * Phase 2 — RECONCILE INBOUND (server → local)
 *   Compare server metadata with local IndexedDB rows:
 *   a) Note on server but NOT locally  → download full payload, decrypt, save.
 *   b) Server updated_at > local AND local status = 'synced'
 *      → server is newer, download & overwrite local.
 *   c) Note in local (status='synced') but NOT on server
 *      → server deleted it, hard-delete locally.
 *   d) Local note has any pending_* status
 *      → local changes in-flight, skip server overwrite.
 *
 * Phase 3 — FLUSH OUTBOUND (local → server)
 *   Gather all rows with sync_status in ('pending_create','pending_update','pending_delete').
 *   POST /api/notes/sync with LWW timestamps.
 *   Server returns {processed, conflicts, skipped}.
 *
 * Phase 4 — ACKNOWLEDGE
 *   Mark processed items as 'synced' in IndexedDB.
 *   For conflicts (server is newer), upsert the server version locally.
 *
 * ─── Non-blocking Execution ───────────────────────────────────────
 * sync() returns immediately and runs the pulse in the background.
 * React state is updated via the subscriber pattern — UI components
 * subscribe to SyncStatus objects without blocking the render thread.
 *
 * ─── Concurrency Guard ────────────────────────────────────────────
 * A mutex flag prevents overlapping pulses. If a sync is already running
 * when sync() is called again, the new call is a no-op.
 *
 * ─── Back-off ─────────────────────────────────────────────────────
 * On failure: 2 s → 4 s → 8 s → … → 64 s exponential back-off.
 * Reset to 2 s on the next successful pulse.
 */

import {
  db,
  getPendingNotes,
  getPendingCards,
  markAsSynced,
  markCardAsSynced,
  hardDeleteNote,
  hardDeleteCard,
  upsertFromServer,
  upsertCardFromServer,
} from './db';
import { CryptoWorkerClient } from './cryptoWorkerClient';
import { notes as notesApi, vaultCards as vaultCardsApi, ApiError } from './api';
import type { LocalNote } from '../types/notes';
import type { LocalVaultCard } from '../types/vault';
import type { NoteMeta, SyncPayloadItem, VaultCardSyncPayloadItem } from './api';

// ── Public status shape ────────────────────────────────────────────

export type SyncPhase =
  | 'idle'
  | 'meta'       // Phase 1: fetching server metadata
  | 'inbound'    // Phase 2: downloading notes newer on server
  | 'outbound'   // Phase 3: pushing pending local notes
  | 'error';

export interface SyncStatus {
  phase: SyncPhase;
  /** ISO timestamp of last successful full sync, or null if never synced */
  lastSyncedAt: string | null;
  /** How many notes are still in a pending_* state */
  pendingCount: number;
  /** Notes downloaded from server in last pulse */
  inboundCount: number;
  /** Notes uploaded to server in last pulse */
  outboundCount: number;
  /** Conflict count from last pulse */
  conflictCount: number;
  /** Error message, if phase === 'error' */
  errorMessage: string | null;
}

export type SyncStatusListener = (status: SyncStatus) => void;
export type SyncCompleteListener = (result: {
  inboundCount: number;
  outboundCount: number;
  conflictCount: number;
}) => void;

const LAST_SYNC_KEY = 'sn_last_sync';
const MAX_BACKOFF_MS = 64_000;
const BATCH_SIZE = 100;

const DEFAULT_STATUS: SyncStatus = {
  phase: 'idle',
  lastSyncedAt: null,
  pendingCount: 0,
  inboundCount: 0,
  outboundCount: 0,
  conflictCount: 0,
  errorMessage: null,
};

// ── SyncManager ───────────────────────────────────────────────────

export class SyncManager {
  private static instance: SyncManager | null = null;

  private syncing = false;
  private retryHandle: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 2_000;
  private listeners = new Set<SyncStatusListener>();
  private completeListeners = new Set<SyncCompleteListener>();
  private boundOnline: () => void;
  private boundOffline: () => void;

  private status: SyncStatus = { ...DEFAULT_STATUS };

  private constructor() {
    this.boundOnline = () => void this.sync('auto-online');
    this.boundOffline = () => this.emit({ phase: 'idle', errorMessage: null });

    if (typeof window === 'undefined') return;

    this.status.lastSyncedAt = localStorage.getItem(LAST_SYNC_KEY);
    window.addEventListener('online', this.boundOnline);
    window.addEventListener('offline', this.boundOffline);
    // Sync is started explicitly after vault unlock — not here (avoids 401 before unlock).
  }

  static getInstance(): SyncManager {
    if (!SyncManager.instance) {
      SyncManager.instance = new SyncManager();
    }
    return SyncManager.instance;
  }

  // ── Subscription ──────────────────────────────────────────────

  subscribe(listener: SyncStatusListener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  /** Fired after a successful sync pulse — use to reload decrypted UI state. */
  onComplete(listener: SyncCompleteListener): () => void {
    this.completeListeners.add(listener);
    return () => this.completeListeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  // ── Trigger sync ──────────────────────────────────────────────

  /**
   * Triggers a sync pulse. Safe to call concurrently — extra calls while a
   * pulse is running are silently dropped (the in-flight pulse covers them).
   *
   * @param source - Descriptive tag for log messages (e.g. 'manual', 'auto-online')
   */
  sync(source = 'manual'): Promise<void> {
    if (this.syncing) return Promise.resolve();
    if (!navigator.onLine) return Promise.resolve();
    this.cancelRetry();
    return this.runPulse(source);
  }

  // ── Core sync pulse ────────────────────────────────────────────

  private async runPulse(source: string): Promise<void> {
    this.syncing = true;
    let inboundCount = 0;
    let outboundCount = 0;
    let conflictCount = 0;

    try {
      console.debug(`[sync] pulse start (source=${source})`);

      // ── Phase 1: Fetch server metadata ──────────────────────
      this.emit({ phase: 'meta' });
      const [{ notes: serverNoteMeta }, { cards: serverCardMeta }] = await Promise.all([
        notesApi.meta(),
        vaultCardsApi.meta(),
      ]);
      const serverNoteMap = new Map<string, NoteMeta>(serverNoteMeta.map((m) => [m.id, m]));
      const serverCardMap = new Map<string, NoteMeta>(serverCardMeta.map((m) => [m.id, m]));

      // ── Phase 2: Reconcile inbound ──────────────────────────
      this.emit({ phase: 'inbound' });
      const inboundNotes = await this.reconcileNotesInbound(serverNoteMap);
      const inboundCards = await this.reconcileCardsInbound(serverCardMap);
      inboundCount = inboundNotes + inboundCards;

      // ── Phase 3: Flush outbound ─────────────────────────────
      this.emit({ phase: 'outbound' });
      const noteOutbound = await this.flushNotesOutbound();
      const cardOutbound = await this.flushCardsOutbound();
      outboundCount = noteOutbound.outboundCount + cardOutbound.outboundCount;
      conflictCount = noteOutbound.conflictCount + cardOutbound.conflictCount;

      // ── Phase 4: Acknowledge ─────────────────────────────────
      const now = new Date().toISOString();
      localStorage.setItem(LAST_SYNC_KEY, now);

      const pendingCount =
        (await getPendingNotes()).length + (await getPendingCards()).length;

      this.retryDelay = 2_000; // reset back-off on success

      this.emit({
        phase: 'idle',
        lastSyncedAt: now,
        pendingCount,
        inboundCount,
        outboundCount,
        conflictCount,
        errorMessage: null,
      });

      console.debug(
        `[sync] pulse complete — inbound:${inboundCount} outbound:${outboundCount} conflicts:${conflictCount}`,
      );

      for (const listener of this.completeListeners) {
        listener({ inboundCount, outboundCount, conflictCount });
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? `${err.message} (HTTP ${err.status})`
          : err instanceof Error
            ? err.message
            : 'Unknown sync error.';

      console.error('[sync] pulse failed:', msg);
      this.emit({ phase: 'error', errorMessage: msg });
      this.scheduleRetry();
    } finally {
      this.syncing = false;
    }
  }

  // ── Phase 2: Reconcile inbound ────────────────────────────────

  private async reconcileNotesInbound(serverMap: Map<string, NoteMeta>): Promise<number> {
    const localNotes = await db.notes.toArray();
    const localMap = new Map<string, LocalNote>(localNotes.map((n) => [n.id, n]));

    const toFetch: string[] = [];
    const toDeleteLocally: string[] = [];

    // 1. Identify what the server has that we need locally
    for (const [id, serverMeta] of serverMap) {
      const local = localMap.get(id);

      if (!local) {
        // Note exists on server but not locally → fetch it
        toFetch.push(id);
      } else if (local.sync_status === 'synced') {
        const serverTime = new Date(serverMeta.updated_at).getTime();
        const localTime = new Date(local.updated_at).getTime();
        if (serverTime > localTime) {
          // Server version is newer → overwrite local
          toFetch.push(id);
        }
      }
      // If local has pending_* status: local changes take priority — skip.
    }

    // 2. Identify synced local notes that the server no longer has → server deleted them
    for (const [id, local] of localMap) {
      if (!serverMap.has(id) && local.sync_status === 'synced') {
        toDeleteLocally.push(id);
      }
    }

    // 3. Hard-delete server-deleted notes from local IndexedDB
    await Promise.all(toDeleteLocally.map((id) => hardDeleteNote(id)));

    // 4. Batch-fetch notes newer on server and save them locally
    if (toFetch.length === 0) return 0;

    let downloaded = 0;

    // Split into BATCH_SIZE chunks to avoid overloading the server
    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const chunk = toFetch.slice(i, i + BATCH_SIZE);
      const { notes: serverNotes } = await notesApi.batch(chunk);

      for (const sn of serverNotes) {
        // Decrypt via the in-memory worker key before persisting locally
        let decrypted: { title: string; content: string } | null = null;
        try {
          decrypted = await CryptoWorkerClient.getInstance().decrypt(
            sn.encrypted_title,
            sn.encrypted_content,
            sn.iv,
          );
        } catch {
          // Decryption failure = wrong key or corrupted ciphertext.
          // Save the encrypted blob anyway so it's not lost; it will appear
          // as unreadable in the UI with a warning.
        }

        void decrypted; // decrypted is consumed by the UI layer via loadNotes()

        // Persist the encrypted form — the UI layer decrypts on next loadNotes()
        await upsertFromServer({
          id: sn.id,
          encrypted_title: sn.encrypted_title,
          encrypted_content: sn.encrypted_content,
          iv: sn.iv,
          is_pinned: sn.is_pinned,
          is_locked: sn.is_locked ?? false,
          updated_at: sn.updated_at,
          created_at: sn.created_at,
        });

        downloaded++;
      }
    }

    return downloaded;
  }

  private async reconcileCardsInbound(serverMap: Map<string, NoteMeta>): Promise<number> {
    const localCards = await db.cards.toArray();
    const localMap = new Map<string, LocalVaultCard>(localCards.map((c) => [c.id, c]));

    const toFetch: string[] = [];
    const toDeleteLocally: string[] = [];

    for (const [id, serverMeta] of serverMap) {
      const local = localMap.get(id);

      if (!local) {
        toFetch.push(id);
      } else if (local.sync_status === 'synced') {
        const serverTime = new Date(serverMeta.updated_at).getTime();
        const localTime = new Date(local.updated_at).getTime();
        if (serverTime > localTime) {
          toFetch.push(id);
        }
      }
    }

    for (const [id, local] of localMap) {
      if (!serverMap.has(id) && local.sync_status === 'synced') {
        toDeleteLocally.push(id);
      }
    }

    await Promise.all(toDeleteLocally.map((id) => hardDeleteCard(id)));

    if (toFetch.length === 0) return 0;

    let downloaded = 0;

    for (let i = 0; i < toFetch.length; i += BATCH_SIZE) {
      const chunk = toFetch.slice(i, i + BATCH_SIZE);
      const { cards: serverCards } = await vaultCardsApi.batch(chunk);

      for (const sc of serverCards) {
        await upsertCardFromServer({
          id: sc.id,
          encrypted_title: sc.encrypted_title,
          encrypted_content: sc.encrypted_content,
          iv: sc.iv,
          updated_at: sc.updated_at,
          created_at: sc.created_at,
        });
        downloaded++;
      }
    }

    return downloaded;
  }

  // ── Phase 3: Flush outbound ───────────────────────────────────

  private async flushNotesOutbound(): Promise<{ outboundCount: number; conflictCount: number }> {
    const pending = await getPendingNotes();
    if (pending.length === 0) return { outboundCount: 0, conflictCount: 0 };

    const items: SyncPayloadItem[] = pending.map((note) => {
      if (note.sync_status === 'pending_delete') {
        return { id: note.id, updated_at: note.updated_at, deleted: true };
      }
      return {
        id: note.id,
        encrypted_title: note.encrypted_title,
        encrypted_content: note.encrypted_content,
        iv: note.iv,
        is_pinned: note.is_pinned,
        is_locked: note.is_locked ?? false,
        updated_at: note.updated_at,
        deleted: false,
      };
    });

    const result = await notesApi.sync(items);

    // Mark processed items as synced or hard-delete if they were pending_delete
    const processedSet = new Set(result.processed);
    const pendingMap = new Map(pending.map((n) => [n.id, n]));

    await Promise.all(
      result.processed.map(async (id) => {
        const local = pendingMap.get(id);
        if (local?.sync_status === 'pending_delete') {
          await hardDeleteNote(id);
        } else {
          await markAsSynced(id);
        }
      }),
    );

    // Overwrite conflicts with server versions (server won LWW)
    await Promise.all(
      result.conflicts.map((sn) =>
        upsertFromServer({
          id: sn.id,
          encrypted_title: sn.encrypted_title,
          encrypted_content: sn.encrypted_content,
          iv: sn.iv,
          is_pinned: sn.is_pinned,
          is_locked: sn.is_locked ?? false,
          updated_at: sn.updated_at,
          created_at: sn.created_at,
        }),
      ),
    );

    return {
      outboundCount: processedSet.size,
      conflictCount: result.conflicts.length,
    };
  }

  private async flushCardsOutbound(): Promise<{ outboundCount: number; conflictCount: number }> {
    const pending = await getPendingCards();
    if (pending.length === 0) return { outboundCount: 0, conflictCount: 0 };

    const items: VaultCardSyncPayloadItem[] = pending.map((card) => {
      if (card.sync_status === 'pending_delete') {
        return { id: card.id, updated_at: card.updated_at, deleted: true };
      }
      return {
        id: card.id,
        encrypted_title: card.encrypted_title,
        encrypted_content: card.encrypted_content,
        iv: card.iv,
        updated_at: card.updated_at,
        deleted: false,
      };
    });

    const result = await vaultCardsApi.sync(items);
    const pendingMap = new Map(pending.map((c) => [c.id, c]));

    await Promise.all(
      result.processed.map(async (id) => {
        const local = pendingMap.get(id);
        if (local?.sync_status === 'pending_delete') {
          await hardDeleteCard(id);
        } else {
          await markCardAsSynced(id);
        }
      }),
    );

    await Promise.all(
      result.conflicts.map((sc) =>
        upsertCardFromServer({
          id: sc.id,
          encrypted_title: sc.encrypted_title,
          encrypted_content: sc.encrypted_content,
          iv: sc.iv,
          updated_at: sc.updated_at,
          created_at: sc.created_at,
        }),
      ),
    );

    return {
      outboundCount: result.processed.length,
      conflictCount: result.conflicts.length,
    };
  }

  // ── Back-off & retry ─────────────────────────────────────────

  private scheduleRetry(): void {
    this.cancelRetry();
    this.retryHandle = setTimeout(() => {
      this.retryHandle = null;
      void this.sync('retry');
    }, this.retryDelay);
    this.retryDelay = Math.min(this.retryDelay * 2, MAX_BACKOFF_MS);
    console.debug(`[sync] retry scheduled in ${this.retryDelay / 1000}s`);
  }

  private cancelRetry(): void {
    if (this.retryHandle !== null) {
      clearTimeout(this.retryHandle);
      this.retryHandle = null;
    }
  }

  // ── Emit helpers ──────────────────────────────────────────────

  private emit(partial: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...partial };
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }

  // ── Lifecycle ─────────────────────────────────────────────────

  destroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.boundOnline);
      window.removeEventListener('offline', this.boundOffline);
    }
    this.cancelRetry();
    this.listeners.clear();
    this.completeListeners.clear();
    SyncManager.instance = null;
  }
}

// ── React hook ────────────────────────────────────────────────────

import { useEffect, useState } from 'react';

/**
 * useSyncStatus — subscribes to the SyncManager and returns a reactive
 * SyncStatus object. Causes a re-render only when the status changes.
 *
 * Usage:
 *   const { phase, pendingCount, lastSyncedAt } = useSyncStatus();
 */
export function useSyncStatus(): SyncStatus & { syncNow: () => void } {
  const [status, setStatus] = useState<SyncStatus>(DEFAULT_STATUS);

  useEffect(() => {
    const manager = SyncManager.getInstance();
    setStatus(manager.getStatus());
    return manager.subscribe(setStatus);
  }, []);

  const syncNow = () => void SyncManager.getInstance().sync('manual');

  return { ...status, syncNow };
}
