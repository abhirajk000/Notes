'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import { Pin, Trash2, Clock, FileText, Lock, LockOpen } from 'lucide-react';
import type { PlainNote } from '../types/notes';

interface NoteEditorProps {
  note: PlainNote | null;
  isSaving: boolean;
  onSave: (patch: { title: string; content: string; is_pinned: boolean; is_locked: boolean }) => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onToggleLock: () => void;
  isMobile?: boolean;
}

function formatLastSaved(iso: string): string {
  const d = new Date(iso);
  return `Saved at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function countWords(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

export function NoteEditor({
  note,
  isSaving,
  onSave,
  onDelete,
  onTogglePin,
  onToggleLock,
  isMobile = false,
}: NoteEditorProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const titleValueRef = useRef('');
  const contentValueRef = useRef('');
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const isLocked = note?.is_locked ?? false;

  useEffect(() => {
    titleValueRef.current = title;
  }, [title]);

  useEffect(() => {
    contentValueRef.current = content;
  }, [content]);

  useEffect(() => {
    const activeNote = note;
    if (!activeNote || activeNote.is_locked) return;

    return () => {
      if (!isDirtyRef.current) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      onSave({
        title: titleValueRef.current,
        content: contentValueRef.current,
        is_pinned: activeNote.is_pinned,
        is_locked: activeNote.is_locked,
      });
      isDirtyRef.current = false;
    };
  }, [note?.id, onSave]);

  useEffect(() => {
    setTitle(note?.title ?? '');
    setContent(note?.content ?? '');
    titleValueRef.current = note?.title ?? '';
    contentValueRef.current = note?.content ?? '';
    isDirtyRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
  }, [note?.id]);

  const autoResize = useCallback((el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  useEffect(() => autoResize(titleRef.current), [title, autoResize]);
  useEffect(() => autoResize(contentRef.current), [content, autoResize]);

  const saveNow = useCallback(
    (newTitle: string, newContent: string) => {
      if (!note || note.is_locked) return;
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      onSave({
        title: newTitle,
        content: newContent,
        is_pinned: note.is_pinned,
        is_locked: note.is_locked,
      });
      isDirtyRef.current = false;
    },
    [note, onSave],
  );

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isLocked) return;
    const v = e.target.value.replace(/\n/g, '');
    setTitle(v);
    isDirtyRef.current = true;
    saveNow(v, content);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (isLocked) return;
    setContent(e.target.value);
    isDirtyRef.current = true;
    saveNow(title, e.target.value);
  };

  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isLocked) return;
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
      saveNow(title, next);
    }
  };

  if (!note) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center select-none bg-editor dark:bg-editor-dark relative overflow-hidden">
        <div className="absolute inset-0 bg-mesh-light dark:bg-mesh-dark opacity-50 pointer-events-none" aria-hidden />
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-accent/10 blur-2xl scale-150" aria-hidden />
          <div className="relative soft-icon-box w-[72px] h-[72px]">
            <FileText size={30} className="text-accent/70" />
          </div>
        </div>
        <div className="relative">
          <p className="font-display text-xl text-gray-600 dark:text-gray-300">
            Select a note
          </p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2 px-6 max-w-xs leading-relaxed">
            <span className="lg:hidden">Tap </span>
            <span className="hidden lg:inline">Press </span>
            <kbd className="text-[10px] bg-violet-100/80 dark:bg-violet-950/40 px-1.5 py-0.5 rounded-md font-mono border border-violet-200/50 dark:border-violet-800/30 lg:hidden">+</kbd>
            <kbd className="hidden lg:inline text-[10px] bg-violet-100/80 dark:bg-violet-950/40 px-1.5 py-0.5 rounded-md font-mono border border-violet-200/50 dark:border-violet-800/30">⌘N</kbd>
            {' '}to create something new
          </p>
        </div>
      </div>
    );
  }

  const wordCount = countWords(content);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-editor dark:bg-editor-dark relative">
      <div className="absolute inset-0 bg-mesh-light dark:bg-mesh-dark opacity-30 pointer-events-none" aria-hidden />

      <div className="relative flex items-center gap-1 px-4 sm:px-6 py-2.5 sm:py-3 border-b border-violet-100/40 dark:border-violet-900/15 flex-shrink-0 bg-white/50 dark:bg-white/[0.02] backdrop-blur-sm">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-gray-500 mr-auto min-w-0">
          <Clock size={12} className="flex-shrink-0" />
          {isSaving ? (
            <span className="text-accent truncate font-medium">Saving…</span>
          ) : isLocked ? (
            <span className="text-amber-600 dark:text-amber-400 truncate font-medium">Locked</span>
          ) : (
            <span className="truncate">{isMobile ? formatLastSaved(note.updated_at).replace('Saved at ', '') : formatLastSaved(note.updated_at)}</span>
          )}
          {!isLocked && (
            <>
              <span className="mx-1 text-violet-200 dark:text-violet-800 hidden sm:inline">·</span>
              <span className="hidden sm:inline whitespace-nowrap tabular-nums">{wordCount.toLocaleString()} {wordCount === 1 ? 'word' : 'words'}</span>
            </>
          )}
        </div>

        <ToolbarButton
          onClick={onToggleLock}
          active={isLocked}
          title={isLocked ? 'Unlock note for editing' : 'Lock note (prevent accidental edits)'}
          activeClass="text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 shadow-soft-inset"
        >
          {isLocked ? <Lock size={15} className="fill-amber-400/30" /> : <LockOpen size={15} />}
        </ToolbarButton>

        <ToolbarButton
          onClick={onTogglePin}
          active={note.is_pinned}
          title={note.is_pinned ? 'Unpin note' : 'Pin note'}
          activeClass="text-accent bg-accent-muted/80 dark:bg-accent-muted-dark shadow-soft-inset"
        >
          <Pin size={15} className={note.is_pinned ? 'fill-accent/40' : ''} />
        </ToolbarButton>

        <ToolbarButton
          onClick={onDelete}
          title="Delete note"
          activeClass="text-red-500 bg-red-50 dark:bg-red-950/30"
        >
          <Trash2 size={15} />
        </ToolbarButton>
      </div>

      {isLocked && (
        <div className="relative flex items-center gap-2 px-4 sm:px-6 py-2.5 bg-amber-50/80 dark:bg-amber-950/20 border-b border-amber-200/50 dark:border-amber-900/30 text-xs text-amber-700 dark:text-amber-400">
          <Lock size={12} className="flex-shrink-0" />
          <span>This note is locked. Unlock to edit — delete is still available.</span>
        </div>
      )}

      <div className={`relative flex-1 overflow-y-auto mobile-scroll px-4 sm:px-10 md:px-16 lg:px-28 py-6 sm:py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))] ${isLocked ? 'select-text' : ''}`}>
        <textarea
          ref={titleRef}
          value={title}
          onChange={handleTitleChange}
          placeholder="Untitled"
          rows={1}
          readOnly={isLocked}
          className={`note-editor-title text-gray-900 dark:text-gray-50 placeholder-gray-300/80 dark:placeholder-zinc-600 mb-5 block ${isLocked ? 'cursor-default opacity-90' : ''}`}
        />

        <div className={`w-12 h-px bg-gradient-to-r mb-7 ${isLocked ? 'from-amber-400/40' : 'from-accent/40'} to-transparent`} />

        <textarea
          ref={contentRef}
          value={content}
          onChange={handleContentChange}
          onKeyDown={handleContentKeyDown}
          placeholder="Start writing…"
          rows={1}
          readOnly={isLocked}
          className={`note-editor-body text-gray-700 dark:text-gray-300 placeholder-gray-300/70 dark:placeholder-zinc-600 block ${isLocked ? 'cursor-default opacity-90' : ''}`}
        />
      </div>
    </div>
  );
}

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
        p-2.5 rounded-xl transition-all duration-200 min-w-[44px] min-h-[44px] flex items-center justify-center
        active:scale-95
        ${
          active
            ? activeClass
            : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-white/80 dark:hover:bg-white/[0.06]'
        }
      `}
    >
      {children}
    </button>
  );
}
