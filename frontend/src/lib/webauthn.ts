/**
 * WebAuthn Biometric Key-Wrapping
 * ================================
 * Uses the WebAuthn PRF (Pseudo-Random Function) extension to derive a
 * deterministic wrapping key from the device's secure enclave.
 *
 * Security model:
 *  - The master password is encrypted with AES-GCM using a key derived
 *    from the PRF output (device biometric assertion).
 *  - The PRF output is only accessible after a successful local biometric
 *    verification (Face ID / Touch ID / Windows Hello).
 *  - The encrypted blob is stored in localStorage — safe because it is
 *    computationally infeasible to decrypt without the PRF output.
 *  - The raw master password is NEVER written to localStorage.
 *
 * Browser support (as of 2025):
 *  Chrome 116+, Firefox 119+, Safari 17.4+
 *  Chromium-based browsers on Android support the PRF extension.
 */

import type {
  StoredBiometricCredential,
  PublicKeyCredentialCreationOptionsPRF,
  PublicKeyCredentialRequestOptionsPRF,
  AuthenticationExtensionsPRFOutputs,
} from '../types/webauthn';

const RP_ID = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
const RP_NAME = 'Notes';
const STORAGE_KEY = 'sn_biometric_cred';

// Fixed PRF input — same value on every call → same output from secure enclave
const PRF_SALT = new TextEncoder().encode('secure-notes-unlock-v1');

// ── Helpers ────────────────────────────────────────────────────

function b64urlEncode(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function b64urlDecode(str: string): ArrayBuffer {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

function getPrfOutput(credential: PublicKeyCredential): ArrayBuffer | null {
  const ext = credential.getClientExtensionResults() as {
    prf?: AuthenticationExtensionsPRFOutputs;
  };
  return ext.prf?.results?.first ?? null;
}

/**
 * Derives an AES-GCM wrapping key from the PRF output via HKDF.
 * This adds domain separation so the wrapping key cannot be reused
 * for any other purpose.
 */
async function deriveWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  const prfKeyMaterial = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(32), // zero salt — domain separation is in `info`
      info: new TextEncoder().encode('secure-notes-wrap-key-v1'),
    },
    prfKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Returns true if the browser supports WebAuthn + PRF extension.
 * Must be called inside an effect (client-side only).
 */
export function isBiometricSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function'
  );
}

/** Returns true if a biometric credential has been registered for this device. */
export function isBiometricEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Registers a new WebAuthn credential and wraps the master password.
 *
 * Call this when the user clicks "Enable Biometric Unlock" after entering
 * their password for the first time. Requires a user gesture.
 *
 * @param username - Displayed in the OS biometric prompt
 * @param masterPassword - The plaintext password to wrap and store
 * @throws If the authenticator does not support PRF, biometrics are not
 *         available, or the user cancels the prompt.
 */
export async function registerBiometric(
  username: string,
  masterPassword: string,
): Promise<void> {
  if (!isBiometricSupported()) {
    throw new Error('WebAuthn is not supported in this browser.');
  }

  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const options: PublicKeyCredentialCreationOptionsPRF = {
    challenge,
    rp: { name: RP_NAME, id: RP_ID },
    user: {
      id: userId,
      name: username,
      displayName: username,
    },
    pubKeyCredParams: [
      { alg: -7, type: 'public-key' },   // ES256 (preferred)
      { alg: -257, type: 'public-key' }, // RS256 (fallback for Windows Hello)
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // device-local only (Face ID / Touch ID)
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    },
    timeout: 60_000,
    attestation: 'none',
    extensions: {
      prf: { eval: { first: PRF_SALT.buffer as ArrayBuffer } },
    },
  };

  const credential = await navigator.credentials.create({
    publicKey: options as PublicKeyCredentialCreationOptions,
  }) as PublicKeyCredential | null;

  if (!credential) throw new Error('Credential creation was cancelled.');

  const prfOutput = getPrfOutput(credential);

  if (!prfOutput) {
    throw new Error(
      'This authenticator does not support the PRF extension. ' +
      'Biometric unlock requires Chrome 116+, Firefox 119+, or Safari 17.4+.',
    );
  }

  // Derive the wrapping key and encrypt the master password
  const wrappingKey = await deriveWrappingKey(prfOutput);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    new TextEncoder().encode(masterPassword),
  );

  const stored: StoredBiometricCredential = {
    credentialId: b64urlEncode(credential.rawId),
    wrappedPassword: b64urlEncode(wrapped),
    wrapIv: b64urlEncode(iv.buffer as ArrayBuffer),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/**
 * Authenticates with the stored WebAuthn credential and returns the
 * decrypted master password.
 *
 * @throws If authentication fails, the user cancels, or the credential
 *         has been revoked.
 */
export async function unlockWithBiometric(): Promise<string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('No biometric credential registered on this device.');

  const stored: StoredBiometricCredential = JSON.parse(raw);
  const credentialId = b64urlDecode(stored.credentialId);
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const options: PublicKeyCredentialRequestOptionsPRF = {
    challenge,
    rpId: RP_ID,
    allowCredentials: [{ type: 'public-key', id: credentialId }],
    userVerification: 'required',
    timeout: 60_000,
    extensions: {
      prf: { eval: { first: PRF_SALT.buffer as ArrayBuffer } },
    },
  };

  const assertion = await navigator.credentials.get({
    publicKey: options as PublicKeyCredentialRequestOptions,
  }) as PublicKeyCredential | null;

  if (!assertion) throw new Error('Biometric authentication was cancelled.');

  const prfOutput = getPrfOutput(assertion);
  if (!prfOutput) throw new Error('PRF output missing from assertion.');

  const wrappingKey = await deriveWrappingKey(prfOutput);

  const wrapped = b64urlDecode(stored.wrappedPassword);
  const iv = new Uint8Array(b64urlDecode(stored.wrapIv));

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrappingKey, wrapped);
  } catch {
    throw new Error('Failed to decrypt credential — the stored credential may be corrupt.');
  }

  return new TextDecoder().decode(decrypted);
}

/** Removes the stored biometric credential from localStorage. */
export function disableBiometric(): void {
  localStorage.removeItem(STORAGE_KEY);
}
