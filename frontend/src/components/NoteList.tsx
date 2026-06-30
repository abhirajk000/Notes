'use client';

import { Pin, FileText } from 'lucide-react';
import type { PlainNote } from '../types/notes';

interface NoteListProps {
  notes: PlainNote[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
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

  return (
    <button
      onClick={onClick}
      className={`
        w-full text-left px-4 py-3.5 border-b border-violet-50 dark:border-violet-900/15
        transition-all duration-200 group
        ${
          selected
            ? 'bg-accent-muted dark:bg-accent-muted-dark border-l-2 border-l-accent'
            : 'hover:bg-violet-50/60 dark:hover:bg-violet-950/20 border-l-2 border-l-transparent'
        }
      `}
    >
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <h3
          className={`text-sm font-semibold leading-snug truncate flex-1
          ${selected ? 'text-brand-deep dark:text-violet-200' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {note.title || 'Untitled'}
        </h3>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5 tabular-nums">
          {formatDate(note.updated_at)}
        </span>
      </div>

      <div className="flex items-center gap-1.5">
        {note.is_pinned && (
          <Pin size={11} className="text-accent flex-shrink-0 fill-violet-300" />
        )}
        <p className="text-xs text-gray-400 dark:text-gray-500 truncate leading-normal">
          {preview || 'No additional text'}
        </p>
      </div>
    </button>
  );
}

export function NoteList({ notes, selectedId, isLoading, onSelect }: NoteListProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col p-2 gap-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-4 py-3.5 rounded-2xl">
            <div className="h-3.5 bg-violet-100 dark:bg-violet-900/30 rounded-lg mb-2 w-3/4 animate-pulse" />
            <div className="h-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg w-1/2 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6 py-12">
        <div className="soft-icon-box w-14 h-14">
          <FileText size={24} className="text-accent/60" />
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed">
          No notes yet.
          <br />
          Press{' '}
          <kbd className="text-xs bg-violet-50 dark:bg-violet-950/40 px-1.5 py-0.5 rounded-lg font-mono">⌘N</kbd>{' '}
          to create one.
        </p>
      </div>
    );
  }

  const pinned = notes.filter((n) => n.is_pinned);
  const unpinned = notes.filter((n) => !n.is_pinned);

  return (
    <div className="flex-1 overflow-y-auto">
      {pinned.length > 0 && (
        <>
          <SectionHeader label="Pinned" />
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
          {pinned.length > 0 && <SectionHeader label="Notes" />}
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

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="px-4 pt-4 pb-1.5">
      <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
