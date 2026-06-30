'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker on mount.
 * Enables offline shell caching for the PWA install prompt.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('[PWA] Service worker registration failed:', err));
  }, []);

  return null;
}
