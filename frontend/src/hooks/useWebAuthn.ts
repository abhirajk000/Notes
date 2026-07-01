'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  isSecureBiometricEnvironment,
  isBiometricSupported,
  isBiometricEnabled,
  isPrfCapable,
  registerBiometric,
  unlockWithBiometric,
  disableBiometric,
  assertSecureBiometricEnvironment,
} from '../lib/biometrics';

type WebAuthnState = 'idle' | 'registering' | 'authenticating' | 'error';

interface UseWebAuthnReturn {
  isSupported: boolean;
  isEnabled: boolean;
  state: WebAuthnState;
  error: string | null;
  /** Enable biometrics: registers a credential and wraps the password. */
  enable: (username: string, password: string) => Promise<void>;
  /** Authenticate: returns the unwrapped master password. */
  authenticate: () => Promise<string>;
  /** Removes stored credential from this device. */
  disable: () => void;
  clearError: () => void;
}

export function useWebAuthn(): UseWebAuthnReturn {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [state, setState] = useState<WebAuthnState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      const basic =
        isSecureBiometricEnvironment() && isBiometricSupported();
      if (!basic) {
        if (!cancelled) setIsSupported(false);
        return;
      }
      const prf = await isPrfCapable();
      if (!cancelled) setIsSupported(prf);
    }

    setIsEnabled(isBiometricEnabled());
    void probe();

    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async (username: string, password: string) => {
    setState('registering');
    setError(null);
    try {
      assertSecureBiometricEnvironment();
      await registerBiometric(username, password);
      setIsEnabled(true);
      setState('idle');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed.';
      setError(msg);
      setState('error');
      throw err;
    }
  }, []);

  const authenticate = useCallback(async (): Promise<string> => {
    setState('authenticating');
    setError(null);
    try {
      assertSecureBiometricEnvironment();
      const password = await unlockWithBiometric();
      setState('idle');
      return password;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      setError(msg);
      setState('error');
      throw err;
    }
  }, []);

  const disable = useCallback(() => {
    disableBiometric();
    setIsEnabled(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
    setState('idle');
  }, []);

  return { isSupported, isEnabled, state, error, enable, authenticate, disable, clearError };
}
