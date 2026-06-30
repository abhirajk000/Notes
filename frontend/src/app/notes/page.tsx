'use client';

import {
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { Loader2 } from 'lucide-react';
import { AppIcon } from '../../components/AppIcon';
import { AppShell } from '../../components/AppShell';
import { LockScreen } from '../../components/LockScreen';
import { APP_DISPLAY_NAME } from '../../lib/config';
import { useAutoLock } from '../../hooks/useAutoLock';
import { useWebAuthn } from '../../hooks/useWebAuthn';
import { CryptoWorkerClient } from '../../lib/cryptoWorkerClient';
import { SyncManager, useSyncStatus } from '../../lib/syncManager';
import { auth } from '../../lib/api';
import {
  getStoredSession,
  clearLocalSession,
  takePendingUnlock,
  signOut,
  type StoredSession,
} from '../../lib/session';
import {
  getAllNotes,
  saveNote,
  markForDeletion,
} from '../../lib/db';
import {
  loadPlainVaultCards,
  saveVaultCard,
  deleteVaultCard,
} from '../../lib/vaultCards';
import type { PlainNote, LocalNote } from '../../types/notes';
import type { PlainVaultCard, CreditCardData } from '../../types/vault';
import { EMPTY_CARD } from '../../types/vault';

// ── App lock states ────────────────────────────────────────────
type AppState = 'checking' | 'locked' | 'unlocking' | 'unlocked';

export default function NotesPage() {
  const router = useRouter();
  const [appState, setAppState] = useState<AppState>('checking');
  const [session, setSession] = useState<StoredSession | null>(null);
  const [notes, setNotes] = useState<PlainNote[]>([]);
  const [cards, setCards] = useState<PlainVaultCard[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);
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
    setCards([]);
    setSelectedNoteId(null);
    setSelectedCardId(null);
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

  const loadCards = useCallback(async () => {
    const decrypted = await loadPlainVaultCards();
    setCards(
      decrypted.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
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
        await Promise.all([loadNotes(), loadCards()]);
        setAppState('unlocked');
        void SyncManager.getInstance().sync();
      } catch (err) {
        setAppState('locked');
        const msg = err instanceof Error ? err.message : 'Unlock failed.';
        setUnlockError(msg);
        throw err;
      }
    },
    [session, loadNotes, loadCards],
  );

  // ── Bootstrap: verify server session + auto-unlock after login ──
  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const stored = getStoredSession();
      if (!stored) {
        router.replace('/login');
        return;
      }

      try {
        await auth.me();
      } catch {
        await clearLocalSession();
        router.replace('/login');
        return;
      }

      if (cancelled) return;
      setSession(stored);

      const pending = takePendingUnlock();
      if (pending) {
        setAppState('unlocking');
        try {
          const crypto = CryptoWorkerClient.getInstance();
          await crypto.deriveKey(pending, stored.encryption_salt);
          await Promise.all([loadNotes(), loadCards()]);
          if (!cancelled) {
            setAppState('unlocked');
            void SyncManager.getInstance().sync();
          }
        } catch {
          if (!cancelled) setAppState('locked');
        }
        return;
      }

      setAppState('locked');
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router, loadNotes, loadCards]);

  // ── Biometric unlock ─────────────────────────────────────────
  const handleBiometricUnlock = useCallback(async (): Promise<string> => {
    return webAuthn.authenticate();
  }, [webAuthn]);

  const handleEnableBiometric = useCallback(
    async (password: string) => {
      if (!session) return;
      await webAuthn.enable(APP_DISPLAY_NAME, password);
    },
    [session, webAuthn],
  );

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

  // ── Vault: new card ──────────────────────────────────────────
  const handleAddCard = useCallback(() => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const placeholder: PlainVaultCard = {
      id,
      ...EMPTY_CARD,
      updated_at: now,
      created_at: now,
    };
    setCards((prev) => [placeholder, ...prev]);
    setSelectedCardId(id);
  }, []);

  // ── Vault: save card ───────────────────────────────────────────
  const handleSaveCard = useCallback(
    async (data: CreditCardData) => {
      if (!selectedCardId) return;
      setIsSavingCard(true);

      try {
        await saveVaultCard({ id: selectedCardId, ...data });
        const now = new Date().toISOString();

        setCards((prev) => {
          const updated = prev.map((c) =>
            c.id === selectedCardId ? { ...c, ...data, updated_at: now } : c,
          );
          return updated.sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
          );
        });
      } finally {
        setIsSavingCard(false);
      }
    },
    [selectedCardId],
  );

  // ── Vault: delete card ───────────────────────────────────────
  const handleDeleteCard = useCallback(async () => {
    if (!selectedCardId) return;
    await deleteVaultCard(selectedCardId);
    setCards((prev) => prev.filter((c) => c.id !== selectedCardId));
    setSelectedCardId(null);
  }, [selectedCardId]);

  // ── Dark mode toggle ─────────────────────────────────────────
  const handleToggleDark = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

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
        notes={notes}
        selectedNoteId={selectedNoteId}
        cards={cards}
        selectedCardId={selectedCardId}
        isLoading={appState === 'unlocking'}
        isSyncing={syncStatusHook.phase !== 'idle' && syncStatusHook.phase !== 'error'}
        syncStatus={syncStatusHook}
        onSyncNow={syncStatusHook.syncNow}
        isSaving={isSaving}
        isSavingCard={isSavingCard}
        isDark={isDark}
        isBiometricEnabled={webAuthn.isEnabled}
        isBiometricSupported={webAuthn.isSupported}
        onEnableBiometric={handleEnableBiometric}
        onSelectNote={setSelectedNoteId}
        onNewNote={handleNewNote}
        onSaveNote={handleSaveNote}
        onDeleteNote={handleDeleteNote}
        onTogglePin={handleTogglePin}
        onSelectCard={setSelectedCardId}
        onAddCard={handleAddCard}
        onSaveCard={handleSaveCard}
        onDeleteCard={handleDeleteCard}
        onToggleDark={handleToggleDark}
        onLock={handleLock}
      />

      <LockScreen
        isBiometricEnabled={webAuthn.isEnabled}
        isBiometricSupported={webAuthn.isSupported}
        onUnlock={handleUnlock}
        onBiometricUnlock={handleBiometricUnlock}
        onSignOut={() => void signOut()}
        isVisible={appState === 'locked' || appState === 'unlocking'}
      />
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────

function LoadingScreen() {
  return (
    <div className="h-dvh w-dvw flex items-center justify-center bg-surface dark:bg-surface-dark relative overflow-hidden">
      <div className="absolute inset-0 bg-mesh-light dark:bg-mesh-dark opacity-60" aria-hidden />
      <div className="relative flex flex-col items-center gap-5 animate-fade-in">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-accent/20 blur-xl scale-125 animate-soft-pulse" aria-hidden />
          <AppIcon size={60} className="relative shadow-soft-lg" />
        </div>
        <div className="flex items-center gap-2.5 text-sm text-gray-500 dark:text-gray-400 font-medium">
          <Loader2 size={15} className="animate-spin text-accent" />
          Unlocking vault…
        </div>
      </div>
    </div>
  );
}
