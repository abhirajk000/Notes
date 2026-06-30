'use client';

import { useState, useCallback } from 'react';
import { ChevronLeft, Menu } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';
import type { PlainNote } from '../types/notes';
import type { SyncStatus } from '../lib/syncManager';

type MobilePanel = 'list' | 'editor';

interface AppShellProps {
  // User
  username: string;
  // Notes state
  notes: PlainNote[];
  selectedNoteId: string | null;
  isLoading: boolean;
  isSyncing: boolean;
  isSaving: boolean;
  syncStatus: SyncStatus;
  onSyncNow: () => void;
  // Theme
  isDark: boolean;
  // Biometric
  isBiometricEnabled: boolean;
  // Handlers
  onSelectNote: (id: string) => void;
  onNewNote: () => void;
  onSaveNote: (patch: { title: string; content: string; is_pinned: boolean }) => void;
  onDeleteNote: () => void;
  onTogglePin: () => void;
  onToggleDark: () => void;
  onLock: () => void;
  onLogout: () => void;
}

export function AppShell({
  username,
  notes,
  selectedNoteId,
  isLoading,
  isSyncing,
  isSaving,
  syncStatus,
  onSyncNow,
  isDark,
  isBiometricEnabled,
  onSelectNote,
  onNewNote,
  onSaveNote,
  onDeleteNote,
  onTogglePin,
  onToggleDark,
  onLock,
  onLogout,
}: AppShellProps) {
  const [activeFolder, setActiveFolder] = useState<'all' | 'pinned'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobilePanel, setMobilePanel] = useState<MobilePanel>('list');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Filter notes based on active folder + search
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

  const handleSelectNote = useCallback(
    (id: string) => {
      onSelectNote(id);
      setMobilePanel('editor');
    },
    [onSelectNote],
  );

  const handleNewNote = useCallback(() => {
    onNewNote();
    setMobilePanel('editor');
  }, [onNewNote]);

  return (
    <div className="flex h-dvh w-dvw overflow-hidden bg-white dark:bg-[#1c1c1e]">
      {/* ════════════════════════════════════════════════════════
          Mobile sidebar overlay
      ════════════════════════════════════════════════════════ */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ════════════════════════════════════════════════════════
          Col 1 — Sidebar
      ════════════════════════════════════════════════════════ */}
      <div
        className={`
          fixed top-0 left-0 bottom-0 z-50 w-56
          transform transition-transform duration-300 ease-out
          lg:relative lg:translate-x-0 lg:z-auto lg:flex-shrink-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar
          username={username}
          totalNotes={notes.length}
          pinnedNotes={pinnedCount}
          isSyncing={isSyncing}
          syncStatus={syncStatus}
          onSyncNow={onSyncNow}
          isDark={isDark}
          isBiometricEnabled={isBiometricEnabled}
          activeFolder={activeFolder}
          onFolderSelect={(f) => {
            setActiveFolder(f);
            setSidebarOpen(false);
          }}
          onSearch={setSearchQuery}
          onToggleDark={onToggleDark}
          onLock={onLock}
          onLogout={onLogout}
          onNewNote={handleNewNote}
        />
      </div>

      {/* ════════════════════════════════════════════════════════
          Col 2 — Note List
          Hidden on mobile when editor panel is active
      ════════════════════════════════════════════════════════ */}
      <div
        className={`
          flex flex-col w-full lg:w-[300px] flex-shrink-0
          border-r border-gray-200 dark:border-zinc-700/60
          bg-[#f9f9f9] dark:bg-[#2c2c2e]
          ${mobilePanel === 'editor' ? 'hidden lg:flex' : 'flex'}
        `}
      >
        {/* List header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-zinc-700/60 flex-shrink-0">
          {/* Hamburger — mobile sidebar toggle */}
          <button
            className="lg:hidden p-1 -ml-1 rounded-md text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-zinc-700 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} />
          </button>

          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-200 capitalize flex-1">
            {activeFolder === 'all' ? 'All Notes' : 'Pinned'}
          </h2>

          <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
            {filteredNotes.length}
          </span>
        </div>

        <NoteList
          notes={filteredNotes}
          selectedId={selectedNoteId}
          isLoading={isLoading}
          onSelect={handleSelectNote}
        />
      </div>

      {/* ════════════════════════════════════════════════════════
          Col 3 — Editor
          Hidden on mobile when list panel is active
      ════════════════════════════════════════════════════════ */}
      <div
        className={`
          flex-1 flex flex-col min-w-0
          ${mobilePanel === 'list' ? 'hidden lg:flex' : 'flex'}
        `}
      >
        {/* Mobile back button */}
        {mobilePanel === 'editor' && (
          <div className="lg:hidden flex items-center gap-1 px-3 py-2 border-b border-gray-100 dark:border-zinc-700/60 bg-white dark:bg-[#1c1c1e] flex-shrink-0">
            <button
              className="flex items-center gap-1 text-sm text-amber-500 font-medium"
              onClick={() => setMobilePanel('list')}
            >
              <ChevronLeft size={18} />
              Notes
            </button>
          </div>
        )}

        <NoteEditor
          note={selectedNote}
          isSaving={isSaving}
          onSave={onSaveNote}
          onDelete={onDeleteNote}
          onTogglePin={onTogglePin}
        />
      </div>
    </div>
  );
}
