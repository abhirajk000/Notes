'use client';

import {
  useState,
  useEffect,
  useRef,
  FormEvent,
} from 'react';
import { Fingerprint, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react';
import { AppIcon } from './AppIcon';

interface LockScreenProps {
  username: string;
  isBiometricEnabled: boolean;
  isBiometricSupported: boolean;
  onUnlock: (password: string) => Promise<void>;
  onBiometricUnlock: () => Promise<string>;
  onSignOut: () => void;
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

  useEffect(() => {
    if (mode === 'password') {
      setTimeout(() => passwordRef.current?.focus(), 100);
    }
  }, [mode]);

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
      setMode('password');
    }
  };

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
        bg-violet-50/60 dark:bg-violet-950/40 lock-backdrop
        transition-opacity duration-300
        ${isVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}
      `}
    >
      <div className="animate-slide-up w-full max-w-sm">
        <div className="soft-card overflow-hidden shadow-soft-lg">

          <div className="flex flex-col items-center pt-10 pb-6 px-8 border-b border-violet-100/60 dark:border-violet-900/20">
            <AppIcon size={64} className="mb-5 shadow-soft-md" />

            <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-1">
              Notes
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Locked for{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">{username}</span>
            </p>
          </div>

          <div className="px-8 py-6">
            {error && (
              <div className="flex items-start gap-2.5 mb-5 p-3.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-2xl text-sm text-red-700 dark:text-red-400 animate-slide-up">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                <p className="leading-snug">{error}</p>
              </div>
            )}

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
                    bg-accent-muted dark:bg-accent-muted-dark
                    border-2 border-violet-200 dark:border-violet-700
                    flex items-center justify-center
                    transition-transform active:scale-95
                    disabled:opacity-60 disabled:cursor-not-allowed
                    ${!isBusy ? 'biometric-pulse hover:bg-violet-100 dark:hover:bg-violet-900/40' : ''}
                  `}
                >
                  {unlockState === 'biometric-pending' ? (
                    <Loader2 size={30} className="text-accent animate-spin" />
                  ) : (
                    <Fingerprint size={34} className="text-accent dark:text-accent-light" />
                  )}
                </button>

                <p className="text-xs text-gray-400 dark:text-gray-500">
                  {unlockState === 'biometric-pending'
                    ? 'Waiting for biometric…'
                    : 'Touch to unlock'}
                </p>

                <button
                  onClick={() => { setMode('password'); clearError(); }}
                  className="text-sm text-accent dark:text-accent-light hover:underline mt-1"
                >
                  Use password instead
                </button>
              </div>
            )}

            {mode === 'password' && (
              <form onSubmit={handlePasswordUnlock} className="flex flex-col gap-4">
                <div>
                  <label className="block text-xs font-semibold tracking-wide text-gray-500 dark:text-gray-400 mb-2 uppercase">
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
                      className="soft-input pr-10 disabled:opacity-60"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!password.trim() || isBusy}
                  className="soft-btn-primary w-full py-3 shadow-glow"
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

                {isBiometricEnabled && isBiometricSupported && (
                  <button
                    type="button"
                    onClick={() => { setMode('biometric'); clearError(); }}
                    className="flex items-center justify-center gap-1.5 text-sm text-accent dark:text-accent-light hover:underline"
                  >
                    <Fingerprint size={14} />
                    Use biometric instead
                  </button>
                )}
              </form>
            )}
          </div>

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
      <div className="p-4 rounded-2xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 text-sm text-green-700 dark:text-green-400">
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
        className="soft-input"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={!password || state === 'pending'}
          className="soft-btn-primary flex-1 disabled:opacity-50"
        >
          {state === 'pending' ? <Loader2 size={14} className="animate-spin" /> : <Fingerprint size={14} />}
          Enable Biometrics
        </button>
        <button type="button" onClick={onDismiss} className="soft-btn-ghost px-4">
          Cancel
        </button>
      </div>
    </form>
  );
}
