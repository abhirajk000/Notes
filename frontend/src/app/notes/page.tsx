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
import { APP_DISPLAY_NAME } from '../../lib/config';
import { useAutoLock } from '../../hooks/useAutoLock';
import { useWebAuthn } from '../../hooks/useWebAuthn';
import { CryptoWorkerClient } from '../../lib/cryptoWorkerClient';
import { loadPlainNotes, loadPlainVaultCardsFast } from '../../lib/dataLoader';
import { SyncManager, useSyncStatus } from '../../lib/syncManager';
import { auth } from '../../lib/api';
import {
  getStoredSession,
  takePendingUnlock,
  type StoredSession,
} from '../../lib/session';
import {
  saveNote,
  markForDeletion,
  saveVaultCardRow,
} from '../../lib/db';
import {
  saveVaultCard,
  deleteVaultCard,
} from '../../lib/vaultCards';
import type { PlainNote, LocalNote } from '../../types/notes';
import type { PlainVaultCard, CreditCardData } from '../../types/vault';
import { EMPTY_CARD, cardPayload } from '../../types/vault';

type AppState = 'locked' | 'unlocking' | 'unlocked';

function readInitialSession(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  return getStoredSession();
}

export default function NotesPage() {
  const router = useRouter();
  const initialSession = readInitialSession();
  const [appState, setAppState] = useState<AppState>(
    initialSession ? 'locked' : 'locked',
  );
  const [session, setSession] = useState<StoredSession | null>(initialSession);
  const [notes, setNotes] = useState<PlainNote[]>([]);
  const [cards, setCards] = useState<PlainVaultCard[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isDataLoading, setIsDataLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingCard, setIsSavingCard] = useState(false);
  const syncStatusHook = useSyncStatus();
  const [isDark, setIsDark] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const webAuthn = useWebAuthn();
  const syncRef = useRef<SyncManager | null>(null);
  const autoSelectedRef = useRef(false);
  const bootstrapDoneRef = useRef(false);
  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  useEffect(() => {
    CryptoWorkerClient.warmUp();
    router.prefetch('/login');
  }, [router]);

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const dark = saved === 'dark' || (!saved && prefersDark);
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);
  }, []);

  const handleLock = useCallback(() => {
    if (appStateRef.current !== 'unlocked') return;
    try {
      const worker = CryptoWorkerClient.getInstance();
      void worker.destroy().catch(() => {});
    } catch {}
    setNotes([]);
    setCards([]);
    setSelectedNoteId(null);
    setSelectedCardId(null);
    autoSelectedRef.current = false;
    setAppState('locked');
  }, []);

  useAutoLock({
    idleMs: 2 * 60 * 1000,
    onLock: handleLock,
    enabled: appState === 'unlocked',
  });

  const applyLoadedData = useCallback((loadedNotes: PlainNote[], loadedCards: PlainVaultCard[]) => {
    setNotes(loadedNotes);
    setCards(loadedCards);
    if (!autoSelectedRef.current && loadedNotes.length > 0) {
      autoSelectedRef.current = true;
      setSelectedNoteId(loadedNotes[0].id);
    }
  }, []);

  const loadVaultData = useCallback(async () => {
    setIsDataLoading(true);
    try {
      const [loadedNotes, loadedCards] = await Promise.all([
        loadPlainNotes(),
        loadPlainVaultCardsFast(),
      ]);
      applyLoadedData(loadedNotes, loadedCards);
    } finally {
      setIsDataLoading(false);
    }
  }, [applyLoadedData]);

  useEffect(() => {
    if (appState !== 'unlocked') return;
    const manager = SyncManager.getInstance();
    syncRef.current = manager;
    return manager.onComplete(({ inboundCount, conflictCount }) => {
      if (inboundCount > 0 || conflictCount > 0) {
        void loadVaultData();
      }
    });
  }, [appState, loadVaultData]);

  const finishUnlock = useCallback(async () => {
    setAppState('unlocked');
    void SyncManager.getInstance().sync();
    void loadVaultData();
  }, [loadVaultData]);

  const handleUnlock = useCallback(
    async (password: string) => {
      if (!session) return;
      setAppState('unlocking');
      setUnlockError(null);

      try {
        const crypto = CryptoWorkerClient.getInstance();
        await crypto.deriveKey(password, session.encryption_salt);
        await finishUnlock();
      } catch (err) {
        setAppState('locked');
        const msg = err instanceof Error ? err.message : 'Unlock failed.';
        setUnlockError(msg);
        throw err;
      }
    },
    [session, finishUnlock],
  );

  useEffect(() => {
    if (bootstrapDoneRef.current) return;
    bootstrapDoneRef.current = true;

    let cancelled = false;

    async function bootstrap() {
      const stored = getStoredSession();
      if (!stored) {
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
          if (!cancelled) {
            setAppState('unlocked');
            void SyncManager.getInstance().sync();
            setIsDataLoading(true);
            try {
              const [loadedNotes, loadedCards] = await Promise.all([
                loadPlainNotes(),
                loadPlainVaultCardsFast(),
              ]);
              if (!cancelled) applyLoadedData(loadedNotes, loadedCards);
            } finally {
              if (!cancelled) setIsDataLoading(false);
            }
          }
        } catch {
          if (!cancelled) setAppState('locked');
        }
      } else {
        setAppState('locked');
      }

      void auth.me().catch(() => {
        if (!cancelled) router.replace('/login');
      });
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router, applyLoadedData]);

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

  const handleNewNote = useCallback(async () => {
    const id = uuidv4();
    const now = new Date().toISOString();
    const placeholder: PlainNote = {
      id,
      title: '',
      content: '',
      is_pinned: false,
      is_locked: false,
      updated_at: now,
      created_at: now,
    };
    setNotes((prev) => [placeholder, ...prev]);
    setSelectedNoteId(id);

    try {
      const crypto = CryptoWorkerClient.getInstance();
      const { encryptedTitle, encryptedContent, iv } = await crypto.encrypt('', '');
      await saveNote({
        id,
        encrypted_title: encryptedTitle,
        encrypted_content: encryptedContent,
        iv,
        is_pinned: false,
        is_locked: false,
        updated_at: now,
      });
      void SyncManager.getInstance().sync();
    } catch {
      // debounced save from NoteEditor will retry
    }
  }, []);

  const handleSaveNote = useCallback(
    async (patch: { title: string; content: string; is_pinned: boolean; is_locked: boolean }) => {
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
          is_locked: patch.is_locked,
          updated_at: now,
        };

        await saveNote(localNote);

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

  const handleDeleteNote = useCallback(async () => {
    if (!selectedNoteId) return;
    await markForDeletion(selectedNoteId);
    setNotes((prev) => prev.filter((n) => n.id !== selectedNoteId));
    setSelectedNoteId(null);
    void SyncManager.getInstance().sync();
  }, [selectedNoteId]);

  const handleTogglePin = useCallback(async () => {
    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note) return;
    await handleSaveNote({
      title: note.title,
      content: note.content,
      is_pinned: !note.is_pinned,
      is_locked: note.is_locked,
    });
  }, [notes, selectedNoteId, handleSaveNote]);

  const handleToggleLock = useCallback(async () => {
    const note = notes.find((n) => n.id === selectedNoteId);
    if (!note) return;
    await handleSaveNote({
      title: note.title,
      content: note.content,
      is_pinned: note.is_pinned,
      is_locked: !note.is_locked,
    });
  }, [notes, selectedNoteId, handleSaveNote]);

  const handleAddCard = useCallback(async () => {
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

    try {
      const crypto = CryptoWorkerClient.getInstance();
      const { encryptedTitle, encryptedContent, iv } = await crypto.encrypt('', cardPayload(EMPTY_CARD));
      await saveVaultCardRow({
        id,
        encrypted_title: encryptedTitle,
        encrypted_content: encryptedContent,
        iv,
        updated_at: now,
      });
      void SyncManager.getInstance().sync();
    } catch {
      // saved on first edit
    }
  }, []);

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

        void SyncManager.getInstance().sync();
      } finally {
        setIsSavingCard(false);
      }
    },
    [selectedCardId],
  );

  const handleDeleteCard = useCallback(async () => {
    if (!selectedCardId) return;
    await deleteVaultCard(selectedCardId);
    setCards((prev) => prev.filter((c) => c.id !== selectedCardId));
    setSelectedCardId(null);
    void SyncManager.getInstance().sync();
  }, [selectedCardId]);

  const handleToggleDark = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      return next;
    });
  }, []);

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

  if (!session) {
    return null;
  }

  return (
    <div className="relative h-dvh w-dvw overflow-hidden">
      <AppShell
        notes={notes}
        selectedNoteId={selectedNoteId}
        cards={cards}
        selectedCardId={selectedCardId}
        isLoading={isDataLoading}
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
        onToggleLock={handleToggleLock}
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
        unlockError={unlockError}
        isVisible={appState === 'locked' || appState === 'unlocking'}
        isUnlocking={appState === 'unlocking'}
      />
    </div>
  );
}
