'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { AppShell } from '../../components/AppShell';
import { LockScreen } from '../../components/LockScreen';
import { useAutoLock } from '../../hooks/useAutoLock';
import { useWebAuthn } from '../../hooks/useWebAuthn';
import { CryptoWorkerClient } from '../../lib/cryptoWorkerClient';
import { SyncManager, useSyncStatus } from '../../lib/syncManager';
import { auth } from '../../lib/api';
import {
  getAllNotes,
  saveNote,
  markForDeletion,
  clearAllNotes,
} from '../../lib/db';
import type { PlainNote, LocalNote } from '../../types/notes';

// ── Session shape persisted in localStorage ────────────────────
interface StoredSession {
  username: string;
  encryption_salt: string;
}

const SESSION_KEY = 'sn_session';

function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

// ── App lock states ────────────────────────────────────────────
type AppState = 'checking' | 'locked' | 'unlocking' | 'unlocked';

export default function NotesPage() {
  const router = useRouter();
  const [appState, setAppState] = useState<AppState>('checking');
  const [session, setSession] = useState<StoredSession | null>(null);
  const [notes, setNotes] = useState<PlainNote[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const syncStatusHook = useSyncStatus();
  const [isDark, setIsDark] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const webAuthn = useWebAuthn();
  const syncRef = useRef<SyncManager | null>(null);

  // ── Theme init ───────────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved === 'dark' || (!saved && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  // ── Check session on mount ───────────────────────────────────
  useEffect(() => {
    const stored = getStoredSession();
    if (!stored) {
      router.replace('/login');
      return;
    }
    setSession(stored);
    setAppState('locked');
  }, [router]);

  // ── Auto-lock callback ───────────────────────────────────────
  const handleLock = useCallback(() => {
    if (appState !== 'unlocked') return;
    // Wipe the in-memory key from the worker without terminating it
    // (we send CLEAR_KEY so the same worker can accept DERIVE_KEY on unlock)
    try {
      const worker = CryptoWorkerClient.getInstance();
      void worker.destroy().catch(() => {});
    } catch {}
    setNotes([]);
    setSelectedNoteId(null);
    setAppState('locked');
  }, [appState]);

  useAutoLock({
    idleMs: 2 * 60 * 1000,
    onLock: handleLock,
    enabled: appState === 'unlocked',
  });

  // ── Decrypt and load all notes ───────────────────────────────
  const loadNotes = useCallback(async () => {
    const crypto = CryptoWorkerClient.getInstance();
    const localNotes = await getAllNotes();
    const decrypted: PlainNote[] = [];

    for (const note of localNotes) {
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
          updated_at: note.updated_at,
          created_at: note.created_at,
        });
      } catch {
        // Corrupted or wrong-key note — skip silently
      }
    }

    setNotes(
      decrypted.sort(
        (a, b) =>
          Number(b.is_pinned) - Number(a.is_pinned) ||
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
      ),
    );
  }, []);

  // ── Sync manager — reload notes after inbound sync ───────────
  useEffect(() => {
    if (appState !== 'unlocked') return;
    const manager = SyncManager.getInstance();
    syncRef.current = manager;
    return manager.onComplete(({ inboundCount, conflictCount }) => {
      if (inboundCount > 0 || conflictCount > 0) {
        void loadNotes();
      }
    });
  }, [appState, loadNotes]);

  // ── Unlock with password ─────────────────────────────────────
  const handleUnlock = useCallback(
    async (password: string) => {
      if (!session) return;
      setAppState('unlocking');
      setUnlockError(null);

      try {
        const crypto = CryptoWorkerClient.getInstance();
        await crypto.deriveKey(password, session.encryption_salt);
        await loadNotes();
        setAppState('unlocked');
        void SyncManager.getInstance().sync();
      } catch (err) {
        setAppState('locked');
        const msg = err instanceof Error ? err.message : 'Unlock failed.';
        setUnlockError(msg);
        throw err;
      }
    },
    [session, loadNotes],
  );

  // ── Biometric unlock ─────────────────────────────────────────
  const handleBiometricUnlock = useCallback(async (): Promise<string> => {
    return webAuthn.authenticate();
  }, [webAuthn]);

  // ── New note ─────────────────────────────────────────────────
  const handleNewNote = useCallback(() => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const placeholder: PlainNote = {
      id,
      title: '',
      content: '',
      is_pinned: false,
      updated_at: now,
      created_at: now,
    };
    setNotes((prev) => [placeholder, ...prev]);
    setSelectedNoteId(id);
  }, []);

  // ── Save note (debounced from NoteEditor) ────────────────────
  const handleSaveNote = useCallback(
    async (patch: { title: string; content: string; is_pinned: boolean }) => {
      if (!selectedNoteId) return;
      setIsSaving(true);

      try {
        const crypto = CryptoWorkerClient.getInstance();
        const { encryptedTitle, encryptedContent, iv } = await crypto.encrypt(
          patch.title,
          patch.content,
        );
        const now = new Date().toISOString();

        const localNote: Omit<LocalNote, 'sync_status' | 'created_at'> = {
          id: selectedNoteId,
          encrypted_title: encryptedTitle,
          encrypted_content: encryptedContent,
          iv,
          is_pinned: patch.is_pinned,
          updated_at: now,
        };

        await saveNote(localNote);

        // Update plaintext state in memory
        setNotes((prev) => {
          const updated = prev.map((n) =>
            n.id === selectedNoteId
              ? { ...n, ...patch, updated_at: now }
              : n,
          );
          return updated.sort(
            (a, b) =>
              Number(b.is_pinned) - Number(a.is_pinned) ||
              new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          );
        });

        void SyncManager.getInstance().sync();
      } finally {
        setIsSaving(false);
      }
    },
    [selectedNoteId],
  );

  // ── Delete note ──────────────────────────────────────────────
  const handleDeleteNote = useCallback(async () => {
    if (!selectedNoteId) return;
    await markForDeletion(selectedNoteId);
    setNotes((prev) => prev.filter((n) => n.id !== selectedNoteId));
    setSelectedNoteId(null);
    void SyncManager.getInstance().sync();
  }, [selectedNoteId]);

  // ── Toggle pin ───────────────────────────────────────────────
  const handleTogglePin = useCallback(async () => {
    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note) return;
    await handleSaveNote({ title: note.title, content: note.content, is_pinned: !note.is_pinned });
  }, [notes, selectedNoteId, handleSaveNote]);

  // ── Dark mode toggle ─────────────────────────────────────────
  const handleToggleDark = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

  // ── Logout ───────────────────────────────────────────────────
  const handleLogout = useCallback(async () => {
    try {
      await auth.logout();
    } catch {}

    try { CryptoWorkerClient.getInstance().destroy().catch(() => {}); } catch {}
    SyncManager.getInstance().destroy();
    await clearAllNotes();
    localStorage.removeItem(SESSION_KEY);
    router.replace('/login');
  }, [router]);

  // ── Keyboard shortcuts ───────────────────────────────────────
  useEffect(() => {
    if (appState !== 'unlocked') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleNewNote();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'l') {
        e.preventDefault();
        handleLock();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [appState, handleNewNote, handleLock]);

  // ── Render ───────────────────────────────────────────────────

  if (appState === 'checking') {
    return <LoadingScreen />;
  }

  return (
    <div className="relative h-dvh w-dvw overflow-hidden">
      {/* ── App shell (always mounted so layout doesn't jump on unlock) ── */}
      <AppShell
        username={session?.username ?? ''}
        notes={notes}
        selectedNoteId={selectedNoteId}
        isLoading={appState === 'unlocking'}
        isSyncing={syncStatusHook.phase !== 'idle' && syncStatusHook.phase !== 'error'}
        syncStatus={syncStatusHook}
        onSyncNow={syncStatusHook.syncNow}
        isSaving={isSaving}
        isDark={isDark}
        isBiometricEnabled={webAuthn.isEnabled}
        onSelectNote={setSelectedNoteId}
        onNewNote={handleNewNote}
        onSaveNote={handleSaveNote}
        onDeleteNote={handleDeleteNote}
        onTogglePin={handleTogglePin}
        onToggleDark={handleToggleDark}
        onLock={handleLock}
        onLogout={handleLogout}
      />

      {/* ── Lock screen overlay ── */}
      <LockScreen
        username={session?.username ?? ''}
        isBiometricEnabled={webAuthn.isEnabled}
        isBiometricSupported={webAuthn.isSupported}
        onUnlock={handleUnlock}
        onBiometricUnlock={handleBiometricUnlock}
        onSignOut={handleLogout}
        isVisible={appState === 'locked' || appState === 'unlocking'}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="h-dvh w-dvw flex items-center justify-center bg-white dark:bg-zinc-900">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 animate-pulse">
          <span className="text-xl">🔐</span>
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500">Loading…</p>
      </div>
    </div>
  );
}
