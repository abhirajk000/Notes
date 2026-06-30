'use client';

import { useState } from 'react';
import {
  NotebookPen,
  Pin,
  Search,
  Sun,
  Moon,
  Lock,
  RefreshCw,
  Fingerprint,
  CheckCircle2,
  AlertCircle,
  CloudOff,
  CreditCard,
  Plus,
  X,
} from 'lucide-react';
import type { SyncStatus } from '../lib/syncManager';
import { AppIcon } from './AppIcon';
import { InstallApp } from './InstallApp';
import { BiometricSetup } from './LockScreen';

export type AppSection = 'notes' | 'vault';

interface SidebarProps {
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
  isBiometricSupported: boolean;
  onEnableBiometric: (password: string) => Promise<void>;
  activeFolder: 'all' | 'pinned';
  onSectionSelect: (section: AppSection) => void;
  onFolderSelect: (folder: 'all' | 'pinned') => void;
  onSearch: (query: string) => void;
  onToggleDark: () => void;
  onLock: () => void;
  onNewNote: () => void;
  onClose?: () => void;
  showClose?: boolean;
}

export function Sidebar({
  totalNotes,
  pinnedNotes,
  totalCards,
  activeSection,
  syncStatus,
  onSyncNow,
  isDark,
  isBiometricEnabled,
  isBiometricSupported,
  onEnableBiometric,
  activeFolder,
  onSectionSelect,
  onFolderSelect,
  onSearch,
  onToggleDark,
  onLock,
  onNewNote,
  onClose,
  showClose = false,
}: SidebarProps) {
  const [showBiometricSetup, setShowBiometricSetup] = useState(false);
  const isSyncing = syncStatus.phase !== 'idle' && syncStatus.phase !== 'error';
  const isOnline = typeof navigator !== 'undefined' && navigator.onLine;
  return (
    <aside className="flex flex-col h-full bg-sidebar/80 dark:bg-sidebar-dark/90 backdrop-blur-xl border-r border-violet-100/50 dark:border-violet-900/15 select-none overflow-hidden">
      {/* ── App branding + sync ───────────────────────────────── */}
      <div className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <AppIcon size={34} />
          <div className="min-w-0">
            <span className="text-[15px] font-bold text-gray-800 dark:text-gray-100 tracking-tight block leading-tight">
              Notes
            </span>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium tracking-wide">
              Private vault
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <SyncIndicator status={syncStatus} onSyncNow={onSyncNow} isOnline={isOnline} />
          {showClose && onClose && (
            <button
              type="button"
              aria-label="Close menu"
              onClick={onClose}
              className="lg:hidden p-2 rounded-xl text-gray-500 active:bg-violet-100 dark:active:bg-violet-950/40 min-w-[44px] min-h-[44px] flex items-center justify-center"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {/* ── New Note button ──────────────────────────────────── */}
      {activeSection === 'notes' && (
        <div className="px-3 mb-4">
          <button
            onClick={onNewNote}
            className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-gradient-to-b from-accent-light to-accent hover:from-accent hover:to-accent-dark text-sm font-semibold text-white transition-all shadow-soft-md hover:shadow-glow-sm active:scale-[0.98] min-h-[44px]"
          >
            <Plus size={15} strokeWidth={2.5} />
            New Note
            <kbd className="ml-auto hidden sm:inline text-[10px] text-white/60 font-mono bg-white/10 px-1.5 py-0.5 rounded-md">
              ⌘N
            </kbd>
          </button>
        </div>
      )}

      {/* ── Section + folder list ─────────────────────────────── */}
      <nav className="px-2 flex flex-col gap-1 overflow-y-auto mobile-scroll flex-shrink-0">
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
          <label className="flex items-center gap-2.5 px-3.5 py-2.5 bg-white/60 dark:bg-white/[0.04] rounded-xl border border-violet-100/50 dark:border-violet-800/20 shadow-soft-inset focus-within:border-accent/30 focus-within:ring-2 focus-within:ring-accent/10 transition-all">
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
      <div className="px-2 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col gap-0.5 border-t border-violet-100/60 dark:border-violet-900/20 pt-3 overflow-y-auto mobile-scroll max-h-[45vh] lg:max-h-none">
        <InstallApp />
        {isBiometricSupported && !isBiometricEnabled && (
          <ActionItem
            icon={<Fingerprint size={15} />}
            label="Enable Face ID / Touch ID"
            onClick={() => setShowBiometricSetup(true)}
            className="text-accent dark:text-accent-light"
          />
        )}
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

      {showBiometricSetup && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-violet-950/30 backdrop-blur-sm">
          <div className="soft-card w-full max-w-sm p-5 shadow-soft-lg animate-slide-up">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-50 mb-4">
              Enable biometric unlock
            </h2>
            <BiometricSetup
              onEnable={async (password) => {
                await onEnableBiometric(password);
                setShowBiometricSetup(false);
              }}
              onDismiss={() => setShowBiometricSetup(false)}
            />
          </div>
        </div>
      )}
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
      <span className="text-xs text-gray-400 dark:text-gray-600 tabular-nums bg-white/60 dark:bg-white/[0.04] px-2 py-0.5 rounded-md font-medium">
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
