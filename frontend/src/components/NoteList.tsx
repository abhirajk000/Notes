'use client';

import { Pin, FileText, Sparkles, Lock } from 'lucide-react';
import type { PlainNote } from '../types/notes';

interface NoteListProps {
  notes: PlainNote[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onNewNote?: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: 'short' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function NoteCard({
  note,
  selected,
  onClick,
}: {
  note: PlainNote;
  selected: boolean;
  onClick: () => void;
}) {
  const preview = note.content.split('\n').find((l) => l.trim()) ?? '';
  const title = note.title || 'Untitled';

  return (
    <button
      onClick={onClick}
      className={`list-item-card ${selected ? 'list-item-card-selected' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <h3
          className={`text-[13px] font-semibold leading-snug truncate flex-1
          ${selected ? 'text-brand-deep dark:text-violet-200' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {title}
        </h3>
        <span className="text-[10px] text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5 tabular-nums font-medium">
          {formatDate(note.updated_at)}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {note.is_locked && (
          <Lock size={10} className="text-amber-500 dark:text-amber-400 flex-shrink-0" />
        )}
        {note.is_pinned && (
          <Pin size={10} className="text-accent flex-shrink-0 fill-accent/30" />
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate leading-normal">
          {preview || 'No additional text'}
        </p>
      </div>
    </button>
  );
}

export function NoteList({ notes, selectedId, isLoading, onSelect, onNewNote }: NoteListProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col p-3 gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="mx-2 p-3.5 rounded-2xl bg-white/40 dark:bg-white/[0.03]">
            <div className="h-3.5 bg-violet-100/80 dark:bg-violet-900/30 rounded-lg mb-2 w-3/4 animate-pulse" />
            <div className="h-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg w-1/2 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center px-8 py-12">
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-accent/10 blur-2xl scale-150" aria-hidden />
          <div className="relative soft-icon-box w-16 h-16">
            <FileText size={26} className="text-accent/70" />
          </div>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
            No notes yet
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed max-w-[200px] mx-auto">
            <span className="lg:hidden">Tap <strong>+</strong> to create your first note.</span>
            <span className="hidden lg:inline">
              Press{' '}
              <kbd className="text-[10px] bg-violet-100/80 dark:bg-violet-950/40 px-1.5 py-0.5 rounded-md font-mono border border-violet-200/50 dark:border-violet-800/30">⌘N</kbd>{' '}
              to get started.
            </span>
          </p>
        </div>
        {onNewNote && (
          <button
            type="button"
            onClick={onNewNote}
            className="lg:hidden soft-btn-primary mt-1 px-6 py-3 text-sm"
          >
            <Sparkles size={14} />
            Create Note
          </button>
        )}
      </div>
    );
  }

  const pinned = notes.filter((n) => n.is_pinned);
  const unpinned = notes.filter((n) => !n.is_pinned);

  return (
    <div className="flex-1 overflow-y-auto mobile-scroll pb-20 lg:pb-3 pt-1">
      {pinned.length > 0 && (
        <>
          <div className="section-label">Pinned</div>
          {pinned.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              selected={n.id === selectedId}
              onClick={() => onSelect(n.id)}
            />
          ))}
        </>
      )}

      {unpinned.length > 0 && (
        <>
          {pinned.length > 0 && <div className="section-label">Notes</div>}
          {unpinned.map((n) => (
            <NoteCard
              key={n.id}
              note={n}
              selected={n.id === selectedId}
              onClick={() => onSelect(n.id)}
            />
          ))}
        </>
      )}
    </div>
  );
}
