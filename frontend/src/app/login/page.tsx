'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Eye, EyeOff, Shield, Lock } from 'lucide-react';
import { AppIcon } from '../../components/AppIcon';
import { auth, ApiError } from '../../lib/api';
import { VAULT_USERNAME } from '../../lib/config';
import {
  getStoredSession,
  saveStoredSession,
  stashPendingUnlock,
  signOut,
} from '../../lib/session';

function formatApiError(err: ApiError): string {
  if (err.details && typeof err.details === 'object' && err.details !== null) {
    const fields = err.details as Record<string, string>;
    const messages = Object.values(fields);
    if (messages.length > 0) return messages.join(' ');
  }
  return err.message;
}

export default function LoginPage() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // Already signed in on server — go straight to vault
        const me = await auth.me();
        if (!cancelled) {
          const existing = getStoredSession();
          if (!existing || existing.encryption_salt !== me.user.encryption_salt) {
            saveStoredSession({
              username: me.user.username,
              encryption_salt: me.user.encryption_salt,
            });
          }
          router.replace('/notes');
          return;
        }
      } catch {
        // No valid server session — expected after sign-out
      }

      try {
        const status = await auth.status();
        if (!cancelled) {
          // Only show "Create Vault" when no account exists yet
          setIsRegister(!status.hasAccount);
        }
      } catch {
        if (!cancelled) setIsRegister(false);
      } finally {
        if (!cancelled) setReady(true);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      let result;

      if (isRegister) {
        try {
          result = await auth.register(VAULT_USERNAME, password);
        } catch (err) {
          // Account already exists — use login instead
          if (err instanceof ApiError && (err.status === 409 || err.status === 403)) {
            result = await auth.login(VAULT_USERNAME, password);
          } else {
            throw err;
          }
        }
      } else {
        result = await auth.login(VAULT_USERNAME, password);
      }

      saveStoredSession({
        username: result.user.username,
        encryption_salt: result.user.encryption_salt,
      });

      // Auto-unlock vault on /notes — skip the second password prompt
      stashPendingUnlock(password);
      setPassword('');
      router.replace('/notes');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403 || err.status === 404) {
          setError('Cannot reach the server. Check your connection.');
        } else {
          setError(formatApiError(err));
        }
      } else {
        setError('Could not connect to the server. Check your network.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    void signOut();
  };

  if (!ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center login-bg">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-center justify-center p-4 sm:p-6 safe-all login-bg">
      <div className="login-orb login-orb-1" aria-hidden />
      <div className="login-orb login-orb-2" aria-hidden />

      <div className="relative w-full max-w-[420px] animate-slide-up">
        <div className="soft-card px-7 sm:px-9 pt-10 sm:pt-12 pb-[max(2.5rem,env(safe-area-inset-bottom))] shadow-soft-xl">
          <div className="flex flex-col items-center text-center">
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-3xl bg-accent/20 blur-xl scale-110" aria-hidden />
              <AppIcon size={64} className="relative shadow-soft-lg ring-1 ring-white/20" />
            </div>

            <h1 className="font-display text-4xl text-brand-deep dark:text-gray-50 tracking-tight">
              Notes
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2.5 mb-2 max-w-[260px] leading-relaxed">
              {isRegister
                ? 'Create your encrypted vault with a master password.'
                : 'Your private notes, encrypted on this device.'}
            </p>

            <div className="flex items-center gap-2 mb-7">
              <span className="premium-badge">
                <Shield size={11} />
                End-to-end encrypted
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 bg-red-50/80 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40 rounded-2xl text-sm text-red-700 dark:text-red-400 animate-slide-up backdrop-blur-sm">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="master-password"
                className="flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.1em] text-gray-500 dark:text-gray-400 mb-2.5 uppercase"
              >
                <Lock size={11} className="text-accent/70" />
                Master Password
              </label>
              <div className="relative">
                <input
                  id="master-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? 'At least 12 characters' : 'Enter your password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  autoFocus
                  required
                  minLength={isRegister ? 12 : undefined}
                  className="soft-input text-center text-base tracking-wide pr-11"
                />
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded-lg transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {isRegister && (
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2.5 leading-snug text-center">
                  Your key never leaves this device.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || (isRegister && password.length > 0 && password.length < 12)}
              className="soft-btn-primary w-full py-3.5 text-[15px] mt-1"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isRegister ? 'Setting up vault…' : 'Unlocking…'}
                </>
              ) : isRegister ? (
                'Create Vault'
              ) : (
                'Unlock Vault'
              )}
            </button>
          </form>

          {!isRegister && (
            <button
              type="button"
              onClick={handleReset}
              disabled={isLoading}
              className="w-full mt-4 text-xs text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-colors py-2"
            >
              Reset app
            </button>
          )}
        </div>

        <p className="text-center text-[11px] text-gray-400 dark:text-gray-600 mt-6 tracking-wide">
          Zero-knowledge · Local encryption · Syncs securely
        </p>
      </div>
    </div>
  );
}
