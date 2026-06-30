'use client';

import { useEffect, useRef, useCallback } from 'react';

interface UseAutoLockOptions {
  /** Milliseconds of inactivity before auto-lock fires. Default: 2 minutes. */
  idleMs?: number;
  /** Called when the lock condition is met. Must be stable (use useCallback). */
  onLock: () => void;
  /** Set to false to pause the timer (e.g. while on the lock screen itself). */
  enabled?: boolean;
}

const USER_EVENTS: (keyof DocumentEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'touchstart',
  'wheel',
  'pointerdown',
];

/**
 * Auto-lock hook.
 *
 * Triggers `onLock` when:
 *  1. The user has been idle for `idleMs` milliseconds (default 2 min).
 *  2. `document.visibilityState` becomes 'hidden' (tab switch, screen off,
 *     app backgrounded on mobile).
 *
 * Returns `resetTimer()` so the consumer can manually reset the idle clock
 * (e.g. when the user explicitly interacts with a note save operation).
 */
export function useAutoLock({
  idleMs = 2 * 60 * 1000,
  onLock,
  enabled = true,
}: UseAutoLockOptions): { resetTimer: () => void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onLockRef = useRef(onLock);

  // Keep ref in sync without triggering effect re-runs
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (!enabled) return;
    clearTimer();
    timerRef.current = setTimeout(() => {
      onLockRef.current();
    }, idleMs);
  }, [enabled, idleMs, clearTimer]);

  // ── Visibility change listener ───────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Lock immediately when the tab/window is hidden.
        clearTimer();
        onLockRef.current();
      } else {
        // Tab became visible again — restart the idle clock.
        resetTimer();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, resetTimer, clearTimer]);

  // ── Idle activity listeners ──────────────────────────────────
  useEffect(() => {
    if (!enabled) return;

    // Throttle handler: only reschedule timer if more than 500ms have
    // passed since the last recorded activity to avoid spamming setTimeout.
    let lastActivity = Date.now();
    const handleActivity = () => {
      const now = Date.now();
      if (now - lastActivity < 500) return;
      lastActivity = now;
      resetTimer();
    };

    for (const event of USER_EVENTS) {
      document.addEventListener(event, handleActivity, { passive: true });
    }

    // Start the initial timer
    resetTimer();

    return () => {
      clearTimer();
      for (const event of USER_EVENTS) {
        document.removeEventListener(event, handleActivity);
      }
    };
  }, [enabled, resetTimer, clearTimer]);

  return { resetTimer };
}
