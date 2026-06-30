'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { Pin, Trash2, Clock, FileText } from 'lucide-react';
import type { PlainNote } from '../types/notes';

interface NoteEditorProps {
  note: PlainNote | null;
  isSaving: boolean;
  onSave: (patch: { title: string; content: string; is_pinned: boolean }) => void;
  onDelete: () => void;
  onTogglePin: () => void;
}

const DEBOUNCE_MS = 500;

function formatLastSaved(iso: string): string {
  const d = new Date(iso);
  return `Saved at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function NoteEditor({ note, isSaving, onSave, onDelete, onTogglePin }: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  // ── Sync local state when the selected note changes ──────────
  useEffect(() => {
    setTitle(note?.title ?? '');
    setContent(note?.content ?? '');
    isDirtyRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [note?.id]);

  // ── Auto-resize textareas ────────────────────────────────────
  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => autoResize(titleRef.current), [title, autoResize]);
  useEffect(() => autoResize(contentRef.current), [content, autoResize]);

  // ── Debounced save ───────────────────────────────────────────
  const scheduleSave = useCallback(
    (newTitle: string, newContent: string) => {
      if (!note) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);

      debounceRef.current = setTimeout(() => {
        onSave({ title: newTitle, content: newContent, is_pinned: note.is_pinned });
        isDirtyRef.current = false;
        debounceRef.current = null;
      }, DEBOUNCE_MS);
    },
    [note, onSave],
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const v = e.target.value.replace(/\n/g, ''); // no newlines in title
    setTitle(v);
    isDirtyRef.current = true;
    scheduleSave(v, content);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    isDirtyRef.current = true;
    scheduleSave(title, e.target.value);
  };

  // ── Tab key in content → insert spaces ──────────────────────
  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = contentRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next = content.substring(0, start) + '    ' + content.substring(end);
      setContent(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 4;
      });
      scheduleSave(title, next);
    }
  };

  // ── Empty state ──────────────────────────────────────────────
  if (!note) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center select-none bg-editor dark:bg-editor-dark">
        <div className="soft-icon-box w-16 h-16">
          <FileText size={28} className="text-accent/70" />
        </div>
        <div>
          <p className="text-base font-medium text-gray-500 dark:text-gray-400">
            Select a note to edit
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1.5">
            or press{' '}
            <kbd className="text-xs bg-violet-50 dark:bg-violet-950/40 px-1.5 py-0.5 rounded-lg font-mono">⌘N</kbd>{' '}
            to create one
          </p>
        </div>
      </div>
    );
  }

  const wordCount = countWords(content);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-editor dark:bg-editor-dark">
      {/* ── Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-6 py-3 border-b border-violet-100/60 dark:border-violet-900/20 flex-shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mr-auto">
          <Clock size={12} />
          {isSaving ? (
            <span className="text-accent">Saving…</span>
          ) : (
            <span>{formatLastSaved(note.updated_at)}</span>
          )}
          <span className="mx-1 text-violet-200 dark:text-violet-800">·</span>
          <span>{wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}</span>
        </div>

        <ToolbarButton
          onClick={onTogglePin}
          active={note.is_pinned}
          title={note.is_pinned ? 'Unpin note' : 'Pin note'}
          activeClass="text-accent bg-accent-muted dark:bg-accent-muted-dark"
        >
          <Pin size={15} className={note.is_pinned ? 'fill-violet-400' : ''} />
        </ToolbarButton>

        <ToolbarButton
          onClick={onDelete}
          title="Delete note"
          activeClass="text-red-500 bg-red-50 dark:bg-red-950/30"
        >
          <Trash2 size={15} />
        </ToolbarButton>
      </div>

      {/* ── Editor area ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-8 md:px-16 lg:px-24 py-8">
        {/* Title */}
        <textarea
          ref={titleRef}
          value={title}
          onChange={handleTitleChange}
          placeholder="Title"
          rows={1}
          className="note-editor-title text-gray-900 dark:text-gray-50 placeholder-gray-300 dark:placeholder-zinc-600 mb-4 block"
        />

        {/* Divider */}
        <div className="w-full h-px bg-violet-100/80 dark:bg-violet-900/20 mb-6" />

        {/* Content */}
        <textarea
          ref={contentRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleContentKeyDown}
          placeholder="Start writing…"
          rows={1}
          className="note-editor-body text-gray-800 dark:text-gray-200 placeholder-gray-300 dark:placeholder-zinc-600 block"
        />
      </div>
    </div>
  );
}

// ── Toolbar button ─────────────────────────────────────────────

function ToolbarButton({
  children,
  onClick,
  title,
  active = false,
  activeClass = '',
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  active?: boolean;
  activeClass?: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        p-2 rounded-xl transition-all duration-200
        ${
          active
            ? activeClass
            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-violet-50 dark:hover:bg-violet-950/30'
        }
      `}
    >
      {children}
    </button>
  );
}
