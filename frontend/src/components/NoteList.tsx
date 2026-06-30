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
        w-full text-left px-4 py-3.5 border-b border-gray-100 dark:border-zinc-700/50
        transition-colors group
        ${
          selected
            ? 'bg-amber-50 dark:bg-amber-900/20 border-l-2 border-l-amber-400'
            : 'hover:bg-gray-100 dark:hover:bg-zinc-700/40 border-l-2 border-l-transparent'
        }
      `}
    >
      {/* Title row */}
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <h3
          className={`text-sm font-semibold leading-snug truncate flex-1
          ${selected ? 'text-amber-800 dark:text-amber-200' : 'text-gray-900 dark:text-gray-100'}`}
        >
          {note.title || 'Untitled'}
        </h3>
        <span className="text-[11px] text-gray-400 dark:text-gray-500 flex-shrink-0 mt-0.5 tabular-nums">
          {formatDate(note.updated_at)}
        </span>
      </div>

      {/* Preview row */}
      <div className="flex items-center gap-1.5">
        {note.is_pinned && (
          <Pin size={11} className="text-amber-500 flex-shrink-0 fill-amber-400" />
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
      <div className="flex-1 flex flex-col">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="px-4 py-3.5 border-b border-gray-100 dark:border-zinc-700/50">
            <div className="h-3.5 bg-gray-200 dark:bg-zinc-700 rounded mb-2 w-3/4 animate-pulse" />
            <div className="h-3 bg-gray-100 dark:bg-zinc-700/60 rounded w-1/2 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6 py-12">
        <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-zinc-700 flex items-center justify-center">
          <FileText size={22} className="text-gray-300 dark:text-zinc-500" />
        </div>
        <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed">
          No notes yet.
          <br />
          Press{' '}
          <kbd className="text-xs bg-gray-100 dark:bg-zinc-700 px-1.5 py-0.5 rounded font-mono">⌘N</kbd>{' '}
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
    <div className="px-4 pt-3 pb-1">
      <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}
