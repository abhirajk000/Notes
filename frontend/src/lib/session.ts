import { auth } from './api';
import { CryptoWorkerClient } from './cryptoWorkerClient';
import { clearAllNotes } from './db';
import { SyncManager } from './syncManager';
import { clearAllVaultCards } from './vaultCards';
import { disableBiometric } from './biometrics';

export const SESSION_KEY = 'sn_session';
export const PENDING_UNLOCK_KEY = 'sn_pending_unlock';

export interface StoredSession {
  username: string;
  encryption_salt: string;
}

export function getStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

/** Wipe all local vault data and crypto keys. */
export async function clearLocalSession(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem(PENDING_UNLOCK_KEY);
  try {
    disableBiometric();
  } catch {}
  try {
    await CryptoWorkerClient.getInstance().destroy();
  } catch {}
  try {
    SyncManager.getInstance().destroy();
  } catch {}
  await Promise.all([clearAllNotes(), clearAllVaultCards()]);
}

/**
 * Full sign-out: clear server cookie + all local encrypted data.
 * Always lands on /login with a clean state.
 */
export async function signOut(): Promise<void> {
  try {
    await auth.logout();
  } catch {
    // Continue — cookie may already be gone
  }
  await clearLocalSession();
  window.location.replace('/login');
}

/** Password passed from /login → /notes for one-time auto-unlock. */
export function stashPendingUnlock(password: string): void {
  sessionStorage.setItem(PENDING_UNLOCK_KEY, password);
}

export function takePendingUnlock(): string | null {
  const value = sessionStorage.getItem(PENDING_UNLOCK_KEY);
  if (value) sessionStorage.removeItem(PENDING_UNLOCK_KEY);
  return value;
}
