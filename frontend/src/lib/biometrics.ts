/**
 * biometrics.ts — Native OS Biometric Authorization Layer
 * ========================================================
 * Unified entry point for WebAuthn biometric unlock with secure-context
 * enforcement. Wraps the PRF-based key-wrapping implementation in webauthn.ts.
 *
 * Requirements:
 *  - HTTPS (production) or localhost for Secure Context
 *  - WebAuthn with PRF extension (Chrome 130+ on Android with Google Password Manager)
 */

export {
  isBiometricSupported,
  isBiometricEnabled,
  isPrfCapable,
  registerBiometric,
  unlockWithBiometric,
  disableBiometric,
  biometricSetupNeedsSecondPrompt,
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
      'Biometric unlock requires HTTPS (or localhost) and a browser with passkey support.',
    );
  }
}
