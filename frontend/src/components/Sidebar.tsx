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
  CreditCard,
  User,
  Plus,
} from 'lucide-react';
import type { SyncStatus } from '../lib/syncManager';
import { AppIcon } from './AppIcon';
import { InstallApp } from './InstallApp';

export type AppSection = 'notes' | 'vault';

interface SidebarProps {
  username: string;
  totalNotes: number;
  pinnedNotes: number;
  totalCards: number;
  activeSection: AppSection;
  syncStatus: SyncStatus;
  onSyncNow: () => void;
  /** @deprecated kept for compat — use syncStatus.phase instead */
  isSyncing: boolean;
  isDark: boolean;
  isBiometricEnabled: boolean;
  activeFolder: 'all' | 'pinned';
  onSectionSelect: (section: AppSection) => void;
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
  totalCards,
  activeSection,
  syncStatus,
  onSyncNow,
  isDark,
  isBiometricEnabled,
  activeFolder,
  onSectionSelect,
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
    <aside className="flex flex-col h-full bg-sidebar dark:bg-sidebar-dark border-r border-violet-100/80 dark:border-violet-900/20 select-none">
      {/* ── App branding ─────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-3 flex items-center gap-3">
        <AppIcon size={36} />
        <span className="text-base font-bold text-gray-800 dark:text-gray-100 tracking-tight">
          Notes
        </span>
      </div>

      {/* ── User header ─────────────────────────────────────── */}
      <div className="px-4 pb-4 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/40 flex items-center justify-center text-accent font-semibold text-sm flex-shrink-0">
            {username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-200 truncate block">
              {username}
            </span>
            <span className="text-[11px] text-gray-400 dark:text-gray-500 flex items-center gap-1">
              <User size={10} />
              Signed in
            </span>
          </div>
        </div>

        <SyncIndicator status={syncStatus} onSyncNow={onSyncNow} isOnline={isOnline} />
      </div>

      {/* ── New Note button ──────────────────────────────────── */}
      {activeSection === 'notes' && (
        <div className="px-3 mb-3">
          <button
            onClick={onNewNote}
            className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-violet-950/30 hover:bg-violet-50 dark:hover:bg-violet-950/50 text-sm font-medium text-gray-700 dark:text-gray-200 transition-all shadow-soft border border-violet-100/60 dark:border-violet-800/30"
          >
            <Plus size={15} className="text-accent" />
            New Note
            <kbd className="ml-auto text-[10px] text-gray-400 dark:text-gray-500 font-mono bg-violet-50 dark:bg-violet-950/40 px-1.5 py-0.5 rounded-lg">
              ⌘N
            </kbd>
          </button>
        </div>
      )}

      {/* ── Section + folder list ─────────────────────────────── */}
      <nav className="px-2 flex flex-col gap-1">
        <FolderItem
          icon={<NotebookPen size={15} />}
          label="Notes"
          count={totalNotes}
          active={activeSection === 'notes'}
          onClick={() => onSectionSelect('notes')}
        />
        {activeSection === 'notes' && (
          <>
            <FolderItem
              icon={<Pin size={15} />}
              label="Pinned"
              count={pinnedNotes}
              active={activeFolder === 'pinned'}
              onClick={() => onFolderSelect('pinned')}
              indent
            />
            <FolderItem
              icon={<NotebookPen size={15} />}
              label="All Notes"
              count={totalNotes}
              active={activeFolder === 'all'}
              onClick={() => onFolderSelect('all')}
              indent
            />
          </>
        )}
        <FolderItem
          icon={<CreditCard size={15} />}
          label="Card Vault"
          count={totalCards}
          active={activeSection === 'vault'}
          onClick={() => onSectionSelect('vault')}
        />
      </nav>

      <div className="flex-1" />

      {/* ── Search ──────────────────────────────────────────── */}
      {activeSection === 'notes' && (
        <div className="px-3 pb-3">
          <label className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white/80 dark:bg-violet-950/25 rounded-2xl border border-violet-100/60 dark:border-violet-800/25 shadow-soft-inset">
            <Search size={14} className="text-gray-400 dark:text-gray-500 flex-shrink-0" />
            <input
              type="search"
              placeholder="Search notes…"
              onChange={(e) => onSearch(e.target.value)}
              className="w-full bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
            />
          </label>
        </div>
      )}

      {/* ── Bottom actions ───────────────────────────────────── */}
      <div className="px-2 pb-5 flex flex-col gap-0.5 border-t border-violet-100/60 dark:border-violet-900/20 pt-3">
        <InstallApp />
        {isBiometricEnabled && (
          <ActionItem
            icon={<Fingerprint size={15} />}
            label="Biometric Unlock On"
            onClick={() => {}}
            className="text-accent dark:text-accent-light"
          />
        )}
        <ActionItem
          icon={
            <RefreshCw
              size={15}
              className={isSyncing ? 'sync-spin text-accent' : ''}
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

        {syncStatus.lastSyncedAt && (
          <p className="px-3 text-[10px] text-gray-300 dark:text-zinc-600 tabular-nums">
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

function FolderItem({
  icon,
  label,
  count,
  active,
  onClick,
  indent = false,
}: {
  icon: React.ReactNode;
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        soft-nav-item
        ${indent ? 'pl-8 pr-3' : 'px-3'}
        ${active ? 'soft-nav-item-active' : 'soft-nav-item-inactive'}
      `}
    >
      <span className={active ? 'text-accent dark:text-accent-light' : 'text-gray-400 dark:text-gray-500'}>
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums bg-violet-50 dark:bg-violet-950/30 px-1.5 py-0.5 rounded-lg">
        {count}
      </span>
    </button>
  );
}

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
      <span title="Offline — changes saved locally" className="flex-shrink-0 p-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/30">
        <CloudOff size={13} className="text-gray-400 dark:text-gray-500" />
      </span>
    );
  }

  if (status.phase === 'error') {
    return (
      <button onClick={onSyncNow} title={status.errorMessage ?? 'Sync failed'} className="p-1.5 rounded-xl bg-red-50 dark:bg-red-950/30">
        <AlertCircle size={13} className="text-red-400 flex-shrink-0" />
      </button>
    );
  }

  if (status.phase !== 'idle') {
    return (
      <span title={phaseLabel[status.phase]} className="flex items-center gap-1 flex-shrink-0 p-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/30">
        <RefreshCw size={13} className="sync-spin text-accent" />
      </span>
    );
  }

  return (
    <span title="Synced" className="p-1.5 rounded-xl bg-violet-50 dark:bg-violet-950/30">
      <CheckCircle2
        size={13}
        className="text-violet-300 dark:text-violet-600 flex-shrink-0"
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
      className={`soft-nav-item soft-nav-item-inactive px-3 ${className}`}
    >
      {icon}
      {label}
    </button>
  );
}
