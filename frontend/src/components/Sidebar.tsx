'use client';

import {
  NotebookPen,
  Pin,
  Search,
  Sun,
  Moon,
  Lock,
  LogOut,
  RefreshCw,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  CloudOff,
} from 'lucide-react';
import type { SyncStatus } from '../lib/syncManager';

interface SidebarProps {
  username: string;
  totalNotes: number;
  pinnedNotes: number;
  syncStatus: SyncStatus;
  onSyncNow: () => void;
  /** @deprecated kept for compat — use syncStatus.phase instead */
  isSyncing: boolean;
  isDark: boolean;
  isBiometricEnabled: boolean;
  activeFolder: 'all' | 'pinned';
  onFolderSelect: (folder: 'all' | 'pinned') => void;
  onSearch: (query: string) => void;
  onToggleDark: () => void;
  onLock: () => void;
  onLogout: () => void;
  onNewNote: () => void;
}

export function Sidebar({
  username,
  totalNotes,
  pinnedNotes,
  syncStatus,
  onSyncNow,
  isDark,
  isBiometricEnabled,
  activeFolder,
  onFolderSelect,
  onSearch,
  onToggleDark,
  onLock,
  onLogout,
  onNewNote,
}: SidebarProps) {
  const isSyncing = syncStatus.phase !== 'idle' && syncStatus.phase !== 'error';
  const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
  return (
    <aside className="flex flex-col h-full bg-[#efefef] dark:bg-[#1c1c1e] border-r border-gray-200 dark:border-zinc-700/60 select-none">
      {/* ── User header ─────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white font-semibold text-sm flex-shrink-0">
            {username.charAt(0).toUpperCase()}
          </div>
          <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate">
            {username}
          </span>
        </div>

        {/* Sync indicator */}
        <SyncIndicator status={syncStatus} onSyncNow={onSyncNow} isOnline={isOnline} />
      </div>

      {/* ── New Note button ──────────────────────────────────── */}
      <div className="px-3 mb-3">
        <button
          onClick={onNewNote}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/70 dark:bg-zinc-700/60 hover:bg-white dark:hover:bg-zinc-700 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm"
        >
          <NotebookPen size={15} className="text-amber-500" />
          New Note
          <kbd className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono bg-gray-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">
            ⌘N
          </kbd>
        </button>
      </div>

      {/* ── Folder list ─────────────────────────────────────── */}
      <nav className="px-2 flex flex-col gap-0.5">
        <FolderItem
          icon={<NotebookPen size={15} />}
          label="All Notes"
          count={totalNotes}
          active={activeFolder === 'all'}
          onClick={() => onFolderSelect('all')}
        />
        <FolderItem
          icon={<Pin size={15} />}
          label="Pinned"
          count={pinnedNotes}
          active={activeFolder === 'pinned'}
          onClick={() => onFolderSelect('pinned')}
        />
      </nav>

      <div className="flex-1" />

      {/* ── Search ──────────────────────────────────────────── */}
      <div className="px-3 pb-2">
        <label className="flex items-center gap-2 px-2.5 py-1.5 bg-white/60 dark:bg-zinc-700/50 rounded-lg border border-gray-200 dark:border-zinc-600/50">
          <Search size={13} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
          <input
            type="search"
            placeholder="Search notes…"
            onChange={(e) => onSearch(e.target.value)}
            className="w-full bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
          />
        </label>
      </div>

      {/* ── Bottom actions ───────────────────────────────────── */}
      <div className="px-2 pb-4 flex flex-col gap-0.5 border-t border-gray-200 dark:border-zinc-700/60 pt-2">
        {isBiometricEnabled && (
          <ActionItem
            icon={<Fingerprint size={15} />}
            label="Biometric Unlock On"
            onClick={() => {}}
            className="text-amber-600 dark:text-amber-400"
          />
        )}
        {/* Sync Now button */}
        <ActionItem
          icon={
            <RefreshCw
              size={15}
              className={isSyncing ? 'sync-spin text-amber-500' : ''}
            />
          }
          label={
            syncStatus.phase === 'error'
              ? 'Sync failed — retry'
              : syncStatus.pendingCount > 0
                ? `Sync (${syncStatus.pendingCount} pending)`
                : 'Sync Now'
          }
          onClick={onSyncNow}
          className={syncStatus.phase === 'error' ? 'text-red-500 dark:text-red-400' : ''}
        />

        <ActionItem
          icon={isDark ? <Sun size={15} /> : <Moon size={15} />}
          label={isDark ? 'Light Mode' : 'Dark Mode'}
          onClick={onToggleDark}
        />
        <ActionItem
          icon={<Lock size={15} />}
          label="Lock App"
          onClick={onLock}
        />
        <ActionItem
          icon={<LogOut size={15} />}
          label="Log Out"
          onClick={onLogout}
          className="text-red-500 dark:text-red-400"
        />

        {/* Last synced timestamp */}
        {syncStatus.lastSyncedAt && (
          <p className="px-2.5 text-[10px] text-gray-300 dark:text-zinc-600 tabular-nums">
            Last synced{' '}
            {new Date(syncStatus.lastSyncedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </div>
    </aside>
  );
}

// ── Sub-components ─────────────────────────────────────────────

function FolderItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm transition-colors
        ${
          active
            ? 'bg-amber-400/25 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-medium'
            : 'text-gray-600 dark:text-gray-400 hover:bg-white/70 dark:hover:bg-zinc-700/50'
        }
      `}
    >
      <span className={active ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums">{count}</span>
    </button>
  );
}

// ── SyncIndicator ──────────────────────────────────────────────

function SyncIndicator({
  status,
  onSyncNow,
  isOnline,
}: {
  status: SyncStatus;
  onSyncNow: () => void;
  isOnline: boolean;
}) {
  const phaseLabel: Record<string, string> = {
    meta: 'Fetching…',
    inbound: 'Downloading…',
    outbound: 'Uploading…',
    error: 'Sync error',
    idle: '',
  };

  if (!isOnline) {
    return (
      <span title="Offline — changes saved locally" className="flex-shrink-0">
        <CloudOff size={13} className="text-gray-400 dark:text-gray-500" />
      </span>
    );
  }

  if (status.phase === 'error') {
    return (
      <button onClick={onSyncNow} title={status.errorMessage ?? 'Sync failed'}>
        <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
      </button>
    );
  }

  if (status.phase !== 'idle') {
    return (
      <span title={phaseLabel[status.phase]} className="flex items-center gap-1 flex-shrink-0">
        <RefreshCw size={13} className="sync-spin text-amber-500" />
      </span>
    );
  }

  return (
    <span title="Synced">
      <CheckCircle2
        size={13}
        className="text-gray-300 dark:text-zinc-600 flex-shrink-0"
      />
    </span>
  );
}

function ActionItem({
  icon,
  label,
  onClick,
  className = '',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:bg-white/70 dark:hover:bg-zinc-700/50 transition-colors ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}
