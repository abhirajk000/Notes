'use client';

import { useState, useCallback } from 'react';
import { ChevronLeft, Menu, Plus } from 'lucide-react';
import { Sidebar, type AppSection } from './Sidebar';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import { VaultCardList } from './VaultCardList';
import { VaultEditor } from './VaultEditor';
import type { PlainNote } from '../types/notes';
import type { PlainVaultCard, CreditCardData } from '../types/vault';
import type { SyncStatus } from '../lib/syncManager';

type MobilePanel = 'list' | 'editor';

interface AppShellProps {
  notes: PlainNote[];
  selectedNoteId: string | null;
  cards: PlainVaultCard[];
  selectedCardId: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  isSaving: boolean;
  isSavingCard: boolean;
  syncStatus: SyncStatus;
  onSyncNow: () => void;
  isDark: boolean;
  isBiometricEnabled: boolean;
  isBiometricSupported: boolean;
  onEnableBiometric: (password: string) => Promise<void>;
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onSaveNote: (patch: { title: string; content: string; is_pinned: boolean }) => void;
  onDeleteNote: () => void;
  onTogglePin: () => void;
  onSelectCard: (id: string) => void;
  onAddCard: () => void;
  onSaveCard: (data: CreditCardData) => void;
  onDeleteCard: () => void;
  onToggleDark: () => void;
  onLock: () => void;
}

export function AppShell({
  notes,
  selectedNoteId,
  cards,
  selectedCardId,
  isLoading,
  isSyncing,
  isSaving,
  isSavingCard,
  syncStatus,
  onSyncNow,
  isDark,
  isBiometricEnabled,
  isBiometricSupported,
  onEnableBiometric,
  onSelectNote,
  onNewNote,
  onSaveNote,
  onDeleteNote,
  onTogglePin,
  onSelectCard,
  onAddCard,
  onSaveCard,
  onDeleteCard,
  onToggleDark,
  onLock,
}: AppShellProps) {
  const [activeSection, setActiveSection] = useState<AppSection>('notes');
  const [activeFolder, setActiveFolder] = useState<'all' | 'pinned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('list');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const filteredNotes = notes.filter((n) => {
    const matchesFolder = activeFolder === 'all' || (activeFolder === 'pinned' && n.is_pinned);
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      n.title.toLowerCase().includes(q) ||
      n.content.toLowerCase().includes(q);
    return matchesFolder && matchesSearch;
  });

  const pinnedCount = notes.filter((n) => n.is_pinned).length;
  const selectedNote = notes.find((n) => n.id === selectedNoteId) ?? null;
  const selectedCard = cards.find((c) => c.id === selectedCardId) ?? null;

  const handleSelectNote = useCallback(
    (id: string) => {
      onSelectNote(id);
      setMobilePanel('editor');
    },
    [onSelectNote],
  );

  const handleSelectCard = useCallback(
    (id: string) => {
      onSelectCard(id);
      setMobilePanel('editor');
    },
    [onSelectCard],
  );

  const handleNewNote = useCallback(() => {
    onNewNote();
    setMobilePanel('editor');
    setSidebarOpen(false);
  }, [onNewNote]);

  const handleAddCard = useCallback(() => {
    onAddCard();
    setMobilePanel('editor');
    setSidebarOpen(false);
  }, [onAddCard]);

  const handleSectionSelect = useCallback((section: AppSection) => {
    setActiveSection(section);
    setMobilePanel('list');
    setSidebarOpen(false);
  }, []);

  const listTitle =
    activeSection === 'vault'
      ? 'Card Vault'
      : activeFolder === 'all'
        ? 'All Notes'
        : 'Pinned';

  const listCount = activeSection === 'vault' ? cards.length : filteredNotes.length;

  const handleFab = activeSection === 'notes' ? handleNewNote : handleAddCard;
  const fabLabel = activeSection === 'notes' ? 'New note' : 'Add card';

  return (
    <div className="flex h-dvh w-full max-w-[100dvw] overflow-hidden bg-surface dark:bg-surface-dark relative">
      <div className="absolute inset-0 bg-mesh-light dark:bg-mesh-dark opacity-40 pointer-events-none" aria-hidden />

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-violet-950/20 backdrop-blur-md lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <div
        className={`
          fixed top-0 left-0 bottom-0 z-50 w-[min(88vw,300px)]
          transform transition-transform duration-300 ease-out
          lg:relative lg:w-56 lg:translate-x-0 lg:z-auto lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar
          totalNotes={notes.length}
          pinnedNotes={pinnedCount}
          totalCards={cards.length}
          activeSection={activeSection}
          isSyncing={isSyncing}
          syncStatus={syncStatus}
          onSyncNow={onSyncNow}
          isDark={isDark}
          isBiometricEnabled={isBiometricEnabled}
          isBiometricSupported={isBiometricSupported}
          onEnableBiometric={onEnableBiometric}
          activeFolder={activeFolder}
          onSectionSelect={handleSectionSelect}
          onFolderSelect={(f) => {
            setActiveFolder(f);
            setSidebarOpen(false);
          }}
          onSearch={setSearchQuery}
          onToggleDark={onToggleDark}
          onLock={onLock}
          onNewNote={handleNewNote}
          onClose={() => setSidebarOpen(false)}
          showClose={sidebarOpen}
        />
      </div>

      <div
        className={`
          relative flex flex-col w-full lg:w-[320px] flex-shrink-0 min-w-0
          border-r border-violet-100/40 dark:border-violet-900/15
          bg-notelist/80 dark:bg-notelist-dark/90 backdrop-blur-sm
          ${mobilePanel === 'editor' ? 'hidden lg:flex' : 'flex'}
        `}
      >
        <div className="flex items-center gap-2 px-3 sm:px-4 py-3 safe-top border-b border-violet-100/40 dark:border-violet-900/15 flex-shrink-0 bg-white/40 dark:bg-white/[0.02]">
          <button
            type="button"
            aria-label="Open menu"
            className="lg:hidden p-2.5 -ml-1 rounded-xl text-gray-500 dark:text-gray-400 hover:bg-white/60 dark:hover:bg-white/[0.06] active:scale-95 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={20} />
          </button>

          <h2 className="text-[15px] font-semibold text-gray-800 dark:text-gray-200 capitalize flex-1 truncate tracking-tight">
            {listTitle}
          </h2>

          <span className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums bg-white/60 dark:bg-white/[0.04] px-2 py-1 rounded-lg flex-shrink-0 font-medium border border-violet-100/40 dark:border-violet-800/20">
            {listCount}
          </span>
        </div>

        {activeSection === 'notes' ? (
          <NoteList
            notes={filteredNotes}
            selectedId={selectedNoteId}
            isLoading={isLoading}
            onSelect={handleSelectNote}
            onNewNote={handleNewNote}
          />
        ) : (
          <VaultCardList
            cards={cards}
            selectedId={selectedCardId}
            isLoading={isLoading}
            onSelect={handleSelectCard}
            onAddCard={handleAddCard}
          />
        )}

        {/* Mobile FAB */}
        {mobilePanel === 'list' && (
          <button
            type="button"
            aria-label={fabLabel}
            onClick={handleFab}
            className="lg:hidden fixed z-30 right-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] w-14 h-14 rounded-2xl bg-gradient-to-b from-accent-light to-accent text-white shadow-soft-lg shadow-violet-500/25 flex items-center justify-center active:scale-95 hover:shadow-glow transition-all"
          >
            <Plus size={24} strokeWidth={2.5} />
          </button>
        )}
      </div>

      <div
        className={`
          flex-1 flex flex-col min-w-0 min-h-0
          ${mobilePanel === 'list' ? 'hidden lg:flex' : 'flex'}
        `}
      >
        {mobilePanel === 'editor' && (
          <div className="lg:hidden flex items-center gap-2 px-2 py-2 safe-top border-b border-violet-100/60 dark:border-violet-900/20 bg-editor dark:bg-editor-dark flex-shrink-0">
            <button
              type="button"
              className="flex items-center gap-0.5 text-sm text-accent font-medium px-3 py-2.5 rounded-xl active:bg-violet-50 dark:active:bg-violet-950/30 transition-colors min-h-[44px]"
              onClick={() => setMobilePanel('list')}
            >
              <ChevronLeft size={20} />
              <span>{activeSection === 'vault' ? 'Cards' : 'Notes'}</span>
            </button>
          </div>
        )}

        {activeSection === 'notes' ? (
          <NoteEditor
            note={selectedNote}
            isSaving={isSaving}
            onSave={onSaveNote}
            onDelete={onDeleteNote}
            onTogglePin={onTogglePin}
            isMobile={mobilePanel === 'editor'}
          />
        ) : (
          <VaultEditor
            card={selectedCard}
            isSaving={isSavingCard}
            onSave={onSaveCard}
            onDelete={onDeleteCard}
          />
        )}
      </div>
    </div>
  );
}
