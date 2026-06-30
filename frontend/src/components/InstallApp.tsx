'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, Share, X } from 'lucide-react';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function InstallApp() {
  const [installed, setInstalled] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    setInstalled(isStandalone());

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };

    const onInstalled = () => {
      setInstalled(true);
      setPrompt(null);
      setShowGuide(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = useCallback(async () => {
    if (prompt) {
      await prompt.prompt();
      await prompt.userChoice;
      setPrompt(null);
      return;
    }

    setShowGuide(true);
  }, [prompt]);

  if (installed) return null;

  return (
    <>
      <button
        type="button"
        onClick={handleInstall}
        className="soft-nav-item soft-nav-item-inactive px-3 text-accent dark:text-accent-light"
      >
        <Download size={15} />
        Install App
      </button>

      {showGuide && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-violet-950/30 backdrop-blur-sm">
          <div
            className="soft-card w-full max-w-sm p-5 shadow-soft-lg animate-slide-up"
            role="dialog"
            aria-labelledby="install-guide-title"
          >
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h2 id="install-guide-title" className="text-base font-semibold text-gray-900 dark:text-gray-50">
                  Install Notes
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Add to your home screen or desktop for quick access.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="p-1.5 rounded-xl text-gray-400 hover:bg-violet-50 dark:hover:bg-violet-950/30"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            {isIos() ? (
              <ol className="text-sm text-gray-600 dark:text-gray-300 space-y-2.5">
                <li className="flex items-center gap-2">
                  <Share size={14} className="text-accent flex-shrink-0" />
                  Tap <strong>Share</strong> in Safari
                </li>
                <li>Choose <strong>Add to Home Screen</strong></li>
                <li>Tap <strong>Add</strong></li>
              </ol>
            ) : (
              <ul className="text-sm text-gray-600 dark:text-gray-300 space-y-2.5">
                <li>
                  <strong>Android / Windows / Chrome:</strong> use the install icon in the address bar, or tap Install App again when it appears.
                </li>
                <li>
                  <strong>macOS Safari:</strong> File → Add to Dock, or Share → Add to Dock.
                </li>
                <li>
                  <strong>macOS Chrome / Edge:</strong> address bar install icon or Install App in the sidebar.
                </li>
              </ul>
            )}

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="soft-btn-primary w-full mt-5 py-2.5"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
