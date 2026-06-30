'use client';

import {
  useState,
  useEffect,
  useRef,
  FormEvent,
} from 'react';
import { Fingerprint, Eye, EyeOff, Lock, AlertCircle, Loader2 } from 'lucide-react';

interface LockScreenProps {
  username: string;
  isBiometricEnabled: boolean;
  isBiometricSupported: boolean;
  /** Called once the correct password (or biometrically-recovered password) is confirmed */
  onUnlock: (password: string) => Promise<void>;
  /** Triggered when user clicks "Biometric Unlock" button */
  onBiometricUnlock: () => Promise<string>;
  /** Navigates to the login page and clears all local data */
  onSignOut: () => void;
  /** Whether this is the first time (app just loaded, not a re-lock) */
  isVisible: boolean;
}

type LockMode = 'biometric' | 'password';
type UnlockState = 'idle' | 'biometric-pending' | 'password-pending' | 'error';

export function LockScreen({
  username,
  isBiometricEnabled,
  isBiometricSupported,
  onUnlock,
  onBiometricUnlock,
  onSignOut,
  isVisible,
}: LockScreenProps) {
  const [mode, setMode] = useState<LockMode>(
    isBiometricEnabled && isBiometricSupported ? 'biometric' : 'password',
  );
  const [unlockState, setUnlockState] = useState<UnlockState>('idle');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Auto-focus password field when switching to password mode
  useEffect(() => {
    if (mode === 'password') {
      setTimeout(() => passwordRef.current?.focus(), 100);
    }
  }, [mode]);

  // Auto-trigger biometric on first render if enabled
  useEffect(() => {
    if (isVisible && isBiometricEnabled && isBiometricSupported) {
      void handleBiometricUnlock();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible]);

  const clearError = () => {
    setError(null);
    setUnlockState('idle');
  };

  // ── Biometric unlock ─────────────────────────────────────────
  const handleBiometricUnlock = async () => {
    setUnlockState('biometric-pending');
    setError(null);
    try {
      const recoveredPassword = await onBiometricUnlock();
      setUnlockState('password-pending');
      await onUnlock(recoveredPassword);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Biometric authentication failed.';
      setError(msg);
      setUnlockState('error');
      setMode('password'); // graceful fallback
    }
  };

  // ── Password unlock ──────────────────────────────────────────
  const handlePasswordUnlock = async (e: FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setUnlockState('password-pending');
    setError(null);
    try {
      await onUnlock(password);
      setPassword('');
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Incorrect password or decryption failed.';
      setError(msg);
      setUnlockState('error');
    }
  };

  const isBusy = unlockState === 'biometric-pending' || unlockState === 'password-pending';

  return (
    <div
      className={`
        fixed inset-0 z-50 flex items-center justify-center p-4
        bg-white/70 dark:bg-zinc-900/80 lock-backdrop
        transition-opacity duration-300
        ${isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
      `}
    >
      <div className="animate-slide-up w-full max-w-sm">
        <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/40 overflow-hidden border border-gray-200/60 dark:border-zinc-700/60">

          {/* ── Header ────────────────────────────────────────── */}
          <div className="flex flex-col items-center pt-10 pb-6 px-8 border-b border-gray-100 dark:border-zinc-700/60">
            {/* App icon */}
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 mb-4">
              <Lock size={28} className="text-white" strokeWidth={2.5} />
            </div>

            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-1">
              Secure Notes
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Locked for{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">{username}</span>
            </p>
          </div>

          {/* ── Body ──────────────────────────────────────────── */}
          <div className="px-8 py-6">

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2.5 mb-5 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-xl text-sm text-red-700 dark:text-red-400 animate-slide-up">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <p className="leading-snug">{error}</p>
              </div>
            )}

            {/* ── Biometric mode ───────────────────────────────── */}
            {mode === 'biometric' && (
              <div className="flex flex-col items-center gap-4">
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
                  Use Touch ID, Face ID, or your device PIN to unlock.
                </p>

                <button
                  onClick={handleBiometricUnlock}
                  disabled={isBusy}
                  className={`
                    relative w-20 h-20 rounded-full
                    bg-amber-50 dark:bg-amber-900/20
                    border-2 border-amber-300 dark:border-amber-600
                    flex items-center justify-center
                    transition-transform active:scale-95
                    disabled:opacity-60 disabled:cursor-not-allowed
                    ${!isBusy ? 'biometric-pulse hover:bg-amber-100 dark:hover:bg-amber-900/30' : ''}
                  `}
                >
                  {unlockState === 'biometric-pending' ? (
                    <Loader2 size={30} className="text-amber-500 animate-spin" />
                  ) : (
                    <Fingerprint size={34} className="text-amber-500 dark:text-amber-400" />
                  )}
                </button>

                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {unlockState === 'biometric-pending'
                    ? 'Waiting for biometric…'
                    : 'Touch to unlock'}
                </p>

                <button
                  onClick={() => { setMode('password'); clearError(); }}
                  className="text-sm text-amber-600 dark:text-amber-400 hover:underline mt-1"
                >
                  Use password instead
                </button>
              </div>
            )}

            {/* ── Password mode ────────────────────────────────── */}
            {mode === 'password' && (
              <form onSubmit={handlePasswordUnlock} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                    Master Password
                  </label>
                  <div className="relative">
                    <input
                      ref={passwordRef}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); clearError(); }}
                      placeholder="Enter your master password"
                      autoComplete="current-password"
                      disabled={isBusy}
                      className="
                        w-full px-3.5 py-2.5 pr-10 rounded-xl text-sm
                        bg-gray-50 dark:bg-zinc-700/60
                        border border-gray-200 dark:border-zinc-600/60
                        text-gray-900 dark:text-gray-100
                        placeholder-gray-400 dark:placeholder-zinc-500
                        outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400
                        dark:focus:border-amber-500 transition-all
                        disabled:opacity-60
                      "
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!password.trim() || isBusy}
                  className="
                    w-full py-2.5 rounded-xl font-medium text-sm text-white
                    bg-amber-500 hover:bg-amber-400 active:bg-amber-600
                    disabled:opacity-50 disabled:cursor-not-allowed
                    transition-colors flex items-center justify-center gap-2
                    shadow-sm shadow-amber-500/30
                  "
                >
                  {unlockState === 'password-pending' ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Unlocking…
                    </>
                  ) : (
                    'Unlock'
                  )}
                </button>

                {/* Back to biometric if available */}
                {isBiometricEnabled && isBiometricSupported && (
                  <button
                    type="button"
                    onClick={() => { setMode('biometric'); clearError(); }}
                    className="flex items-center justify-center gap-1.5 text-sm text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    <Fingerprint size={14} />
                    Use biometric instead
                  </button>
                )}
              </form>
            )}
          </div>

          {/* ── Footer ────────────────────────────────────────── */}
          <div className="px-8 pb-6 flex justify-center">
            <button
              onClick={onSignOut}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Biometric Setup Sheet ──────────────────────────────────────
// Small inline component for the "Enable biometrics" flow shown in settings.

interface BiometricSetupProps {
  username: string;
  onEnable: (password: string) => Promise<void>;
  onDismiss: () => void;
}

export function BiometricSetup({ username, onEnable, onDismiss }: BiometricSetupProps) {
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setState('pending');
    setError(null);
    try {
      await onEnable(password);
      setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable biometrics.');
      setState('error');
    }
  };

  if (state === 'success') {
    return (
      <div className="p-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 text-sm text-green-700 dark:text-green-400">
        Biometric unlock enabled for <strong>{username}</strong>. You can now use Face ID / Touch ID.
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Enter your master password once to enable biometric unlock. Your password will be securely wrapped by the device's secure enclave.
      </p>
      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Master password"
        className="px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-600 bg-transparent text-sm outline-none focus:ring-2 focus:ring-amber-400/50"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!password || state === 'pending'}
          className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
        >
          {state === 'pending' ? <Loader2 size={14} className="animate-spin" /> : <Fingerprint size={14} />}
          Enable Biometrics
        </button>
        <button type="button" onClick={onDismiss} className="px-4 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors">
          Cancel
        </button>
      </div>
    </form>
  );
}
