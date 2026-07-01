/**
 * useNotes — React hook
 * =====================
 * Orchestrates the full data flow:
 *
 *   User types  →  CryptoWorkerClient.encrypt()
 *                       ↓
 *                  db.saveNote()  (IndexedDB — ciphertext only)
 *                       ↓
 *                  SyncManager.sync()  (push to backend if online)
 *
 * Decryption flows in reverse:
 *
 *   db.getAllNotes()  →  CryptoWorkerClient.decrypt()  →  PlainNote[]
 *
 * The derived CryptoKey never leaves the worker process.
 * The plaintext never touches IndexedDB.
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { CryptoWorkerClient } from './cryptoWorkerClient';
import { SyncManager } from './syncManager';
import { db, getAllNotes, saveNote, markForDeletion, clearAllNotes } from './db';
import type { LocalNote, PlainNote } from '../types/notes';

interface UseNotesOptions {
  /** Called when a decryption error occurs (e.g. wrong key, tampered data) */
  onDecryptError?: (noteId: string, error: Error) => void;
}

interface UseNotesReturn {
  notes: PlainNote[];
  isLoading: boolean;
  isSyncing: boolean;
  /** Call after deriveKey — loads and decrypts all notes from IndexedDB. */
  loadNotes: () => Promise<void>;
  /** Encrypts, saves locally, then triggers a sync. */
  saveNote: (draft: { id?: string; title: string; content: string; is_pinned?: boolean; is_locked?: boolean }) => Promise<string>;
  /** Marks for deletion locally, then triggers a sync. */
  deleteNote: (id: string) => Promise<void>;
  /** Toggle pinned status on a note. */
  togglePin: (id: string) => Promise<void>;
}

export function useNotes(options: UseNotesOptions = {}): UseNotesReturn {
  const [notes, setNotes] = useState<PlainNote[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const cryptoRef = useRef<CryptoWorkerClient | null>(null);
  const syncRef = useRef<SyncManager | null>(null);

  // Subscribe to sync state for UI indicators
  useEffect(() => {
    const manager = SyncManager.getInstance();
    syncRef.current = manager;

    const unsub = manager.subscribe((status) => {
      setIsSyncing(status.phase !== 'idle' && status.phase !== 'error');
    });

    return unsub;
  }, []);

  const loadNotes = useCallback(async () => {
    setIsLoading(true);
    try {
      const crypto = CryptoWorkerClient.getInstance();
      cryptoRef.current = crypto;

      const localNotes = await getAllNotes();
      const decrypted: PlainNote[] = [];

      for (const note of localNotes) {
        // Skip notes marked for deletion from the display list
        if (note.sync_status === 'pending_delete') continue;

        try {
          const { title, content } = await crypto.decrypt(
            note.encrypted_title,
            note.encrypted_content,
            note.iv,
          );
          decrypted.push({
            id: note.id,
            title,
            content,
            is_pinned: note.is_pinned,
            is_locked: note.is_locked ?? false,
            updated_at: note.updated_at,
            created_at: note.created_at,
          });
        } catch (err) {
          options.onDecryptError?.(note.id, err instanceof Error ? err : new Error(String(err)));
        }
      }

      setNotes(decrypted);
    } finally {
      setIsLoading(false);
    }
  }, [options]);

  const handleSaveNote = useCallback(
    async (draft: {
      id?: string;
      title: string;
      content: string;
      is_pinned?: boolean;
      is_locked?: boolean;
    }): Promise<string> => {
      const crypto = CryptoWorkerClient.getInstance();
      const noteId = draft.id ?? uuidv4();
      const now = new Date().toISOString();

      const { encryptedTitle, encryptedContent, iv } = await crypto.encrypt(
        draft.title,
        draft.content,
      );

      const localNote: Omit<LocalNote, 'sync_status' | 'created_at'> = {
        id: noteId,
        encrypted_title: encryptedTitle,
        encrypted_content: encryptedContent,
        iv,
        is_pinned: draft.is_pinned ?? false,
        is_locked: draft.is_locked ?? false,
        updated_at: now,
      };

      await saveNote(localNote);

      // Optimistically update the in-memory plaintext list
      setNotes((prev) => {
        const filtered = prev.filter((n) => n.id !== noteId);
        const updated: PlainNote = {
          id: noteId,
          title: draft.title,
          content: draft.content,
          is_pinned: draft.is_pinned ?? false,
          is_locked: draft.is_locked ?? false,
          updated_at: now,
          created_at: now,
        };
        // Pin sorting: pinned notes float to the top
        return [updated, ...filtered].sort(
          (a, b) => Number(b.is_pinned) - Number(a.is_pinned),
        );
      });

      void SyncManager.getInstance().sync();
      return noteId;
    },
    [],
  );

  const handleDeleteNote = useCallback(async (id: string): Promise<void> => {
    await markForDeletion(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    void SyncManager.getInstance().sync();
  }, []);

  const togglePin = useCallback(
    async (id: string): Promise<void> => {
      const note = notes.find((n) => n.id === id);
      if (!note) return;
      await handleSaveNote({
        id: note.id,
        title: note.title,
        content: note.content,
        is_pinned: !note.is_pinned,
        is_locked: note.is_locked,
      });
    },
    [notes, handleSaveNote],
  );

  return {
    notes,
    isLoading,
    isSyncing,
    loadNotes,
    saveNote: handleSaveNote,
    deleteNote: handleDeleteNote,
    togglePin,
  };
}

/**
 * Clears all local data and destroys the crypto worker.
 * Call this on logout AFTER the server confirms the session cookie
 * has been cleared.
 */
export async function destroySession(): Promise<void> {
  await Promise.all([
    CryptoWorkerClient.getInstance().destroy(),
    clearAllNotes(),
  ]);
  SyncManager.getInstance().destroy();
  // Clear any in-memory references held by React state via page reload
  window.location.replace('/login');
}
