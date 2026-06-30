'use client';

import { useState, useEffect, FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { AppIcon } from '../../components/AppIcon';
import { auth, ApiError } from '../../lib/api';

const USERNAME = 'Abhiraj';

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
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);

  useEffect(() => {
    auth
      .status()
      .then((s) => {
        setRegistrationOpen(s.registrationOpen);
        if (s.registrationOpen) setMode('register');
      })
      .catch(() => setRegistrationOpen(false));
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const result =
        mode === 'register'
          ? await auth.register(USERNAME, password)
          : await auth.login(USERNAME, password);

      localStorage.setItem(
        'sn_session',
        JSON.stringify({
          username: result.user.username,
          encryption_salt: result.user.encryption_salt,
        }),
      );

      router.replace('/notes');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403 || err.status === 404) {
          setError(
            'API not reachable. Check that api.abhiraj.xyz is running.',
          );
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

  const isRegister = mode === 'register';

  return (
    <div className="min-h-dvh flex items-center justify-center p-6 login-bg">
      <div className="w-full max-w-[400px] animate-slide-up">
        <div className="soft-card px-8 pt-10 pb-8 shadow-soft-lg">
          <div className="flex flex-col items-center text-center">
            <AppIcon size={56} className="mb-5 shadow-soft-md" />

            <h1 className="text-2xl font-bold text-brand-deep dark:text-gray-50 tracking-tight">
              Notes
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 mb-6">
              {isRegister
                ? 'Create your vault with a master password (min. 12 characters).'
                : 'Unlock your encrypted notes.'}
            </p>
          </div>

          {!isRegister && registrationOpen && (
            <div className="flex gap-1 p-1 mb-6 -mt-2 bg-violet-50 dark:bg-violet-950/30 rounded-2xl">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className="flex-1 py-2 text-sm font-medium text-white bg-accent rounded-xl shadow-soft transition-all"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); }}
                className="flex-1 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-xl transition-colors"
              >
                Create Account
              </button>
            </div>
          )}

          {isRegister && !registrationOpen && (
            <div className="flex gap-1 p-1 mb-6 -mt-2 bg-violet-50 dark:bg-violet-950/30 rounded-2xl">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className="flex-1 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-xl transition-colors"
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); }}
                className="flex-1 py-2 text-sm font-medium text-white bg-accent rounded-xl shadow-soft transition-all"
              >
                Create Account
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            {error && (
              <div className="flex items-start gap-2 p-3.5 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/40 rounded-2xl text-sm text-red-700 dark:text-red-400 animate-slide-up">
                <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <div>
              <label
                htmlFor="master-password"
                className="block text-[11px] font-bold tracking-[0.12em] text-accent mb-2 uppercase"
              >
                {isRegister ? 'Master Password' : 'Password'}
              </label>
              <div className="relative">
                <input
                  id="master-password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isRegister ? 'At least 12 characters' : '••••••••••••'}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1 rounded-lg"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {isRegister && (
                <p className="text-xs text-gray-400 mt-2 leading-snug text-center">
                  Encrypts your notes locally. Never sent to the server.
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading || (isRegister && password.length > 0 && password.length < 12)}
              className="soft-btn-primary w-full py-3.5 text-[15px] font-semibold shadow-glow"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  {isRegister ? 'Creating…' : 'Unlocking…'}
                </>
              ) : isRegister ? (
                'Create Account'
              ) : (
                'Unlock'
              )}
            </button>

            {!isRegister && registrationOpen && (
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); }}
                className="text-sm text-accent dark:text-accent-light hover:underline"
              >
                First time? Create your vault
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
