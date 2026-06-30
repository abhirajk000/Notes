/**
 * biometrics.ts — Native OS Biometric Authorization Layer
 * ========================================================
 * Unified entry point for WebAuthn biometric unlock with secure-context
 * enforcement. Wraps the PRF-based key-wrapping implementation in webauthn.ts.
 *
 * Requirements:
 *  - HTTPS (Vercel production) or localhost for Secure Context
 *  - navigator.credentials API (Face ID / Touch ID / Windows Hello / PIN)
 */

export {
  isBiometricSupported,
  isBiometricEnabled,
  registerBiometric,
  unlockWithBiometric,
  disableBiometric,
} from './webauthn';

/**
 * Returns true only when biometrics can be safely initialized.
 * Must be called client-side (inside useEffect or event handler).
 */
export function isSecureBiometricEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.isSecureContext === true &&
    typeof navigator !== 'undefined' &&
    typeof navigator.credentials !== 'undefined' &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  );
}

/**
 * Throws if the environment is not suitable for WebAuthn.
 * Call before registerBiometric / unlockWithBiometric.
 */
export function assertSecureBiometricEnvironment(): void {
  if (!isSecureBiometricEnvironment()) {
    throw new Error(
      'Biometric unlock requires a secure context (HTTPS) and a browser ' +
        'with WebAuthn support (Chrome 116+, Firefox 119+, Safari 17.4+).',
    );
  }
}
