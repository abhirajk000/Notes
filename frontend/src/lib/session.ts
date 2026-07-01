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

/** Password passed from /login → /notes for one-time auto-unlock. */
export function stashPendingUnlock(password: string): void {
  sessionStorage.setItem(PENDING_UNLOCK_KEY, password);
}

export function takePendingUnlock(): string | null {
  const value = sessionStorage.getItem(PENDING_UNLOCK_KEY);
  if (value) sessionStorage.removeItem(PENDING_UNLOCK_KEY);
  return value;
}
