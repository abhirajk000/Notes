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
 *    verification (Face ID / Touch ID / fingerprint / device PIN).
 *  - The encrypted blob is stored in localStorage — safe because it is
 *    computationally infeasible to decrypt without the PRF output.
 *  - The raw master password is NEVER written to localStorage.
 *
 * PRF registration pattern (required for Android Chrome):
 *  1. create() with `extensions: { prf: {} }` to enable PRF on the credential
 *  2. get() with `prf.eval` to obtain the PRF bytes (Android does NOT return
 *     PRF output during create — only during authentication)
 *
 * Browser support:
 *  - Desktop: Chrome/Edge 116+, Firefox 119+, Safari 17.4+
 *  - Android: Chrome 130+ with Google Password Manager (Android 14+)
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

function getPrfExtensionResults(credential: PublicKeyCredential): AuthenticationExtensionsPRFOutputs | undefined {
  const ext = credential.getClientExtensionResults() as {
    prf?: AuthenticationExtensionsPRFOutputs;
  };
  return ext.prf;
}

function getPrfOutput(credential: PublicKeyCredential): ArrayBuffer | null {
  return getPrfExtensionResults(credential)?.results?.first ?? null;
}

function isAndroid(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

function prfUnsupportedMessage(): string {
  if (isAndroid()) {
    return (
      'Passkey PRF is not available on this device. On Android, use Chrome 130 or newer, ' +
      'Android 14+, and store passkeys in Google Password Manager (not Chrome profile sync). ' +
      'You may be prompted twice when enabling biometrics — that is normal on Android.'
    );
  }
  return (
    'This passkey provider does not support the PRF extension. ' +
    'Use Chrome 116+, Edge 116+, Firefox 119+, or Safari 17.4+ with a platform passkey ' +
    '(Face ID, Touch ID, Windows Hello, or Google Password Manager).'
  );
}

/**
 * Derives an AES-GCM wrapping key from the PRF output via HKDF.
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
      salt: new Uint8Array(32),
      info: new TextEncoder().encode('secure-notes-wrap-key-v1'),
    },
    prfKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function wrapPassword(wrappingKey: CryptoKey, masterPassword: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    new TextEncoder().encode(masterPassword),
  );
  return { wrapped, iv };
}

/**
 * Runs an authentication ceremony and returns PRF output for a credential.
 * PRF eval is supported on authentication on all platforms including Android.
 */
async function assertForPrfOutput(credentialId: ArrayBuffer): Promise<ArrayBuffer> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));

  const options: PublicKeyCredentialRequestOptionsPRF = {
    challenge,
    rpId: RP_ID,
    allowCredentials: [{ type: 'public-key', id: credentialId }],
    userVerification: 'required',
    timeout: 120_000,
    extensions: {
      prf: { eval: { first: PRF_SALT.buffer as ArrayBuffer } },
    },
  };

  const assertion = (await navigator.credentials.get({
    publicKey: options as PublicKeyCredentialRequestOptions,
  })) as PublicKeyCredential | null;

  if (!assertion) throw new Error('Biometric authentication was cancelled.');

  const prfOutput = getPrfOutput(assertion);
  if (!prfOutput) throw new Error(prfUnsupportedMessage());

  return prfOutput;
}

// ── Public API ─────────────────────────────────────────────────

/** Basic WebAuthn API availability (sync). */
export function isBiometricSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator.credentials?.create === 'function'
  );
}

/**
 * Probes whether the browser reports PRF extension support.
 * Falls back to true when the capability API is unavailable (verified at register time).
 */
export async function isPrfCapable(): Promise<boolean> {
  if (!isBiometricSupported()) return false;

  const getCaps = (
    PublicKeyCredential as unknown as {
      getClientCapabilities?: () => Promise<Record<string, boolean>>;
    }
  ).getClientCapabilities;

  if (typeof getCaps !== 'function') return true;

  try {
    const caps = await getCaps();
    if (caps['extension:prf'] === false) return false;
  } catch {
    // Capability probe failed — attempt registration to know for sure
  }

  return true;
}

/** Returns true if a biometric credential has been registered for this device. */
export function isBiometricEnabled(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Registers a new WebAuthn credential and wraps the master password.
 *
 * Flow:
 *  1. Create passkey with PRF enabled (`prf: {}`)
 *  2. Obtain PRF bytes via authentication (`prf.eval`) — required on Android
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
      { alg: -7, type: 'public-key' },
      { alg: -257, type: 'public-key' },
    ],
    authenticatorSelection: {
      // Do not force platform-only — Android Google Password Manager is the
      // correct provider; Chrome profile passkeys do not support PRF.
      residentKey: 'required',
      userVerification: 'required',
    },
    timeout: 120_000,
    attestation: 'none',
    extensions: {
      // Enable PRF on the credential. Do NOT request eval here — Android Chrome
      // only returns PRF output during authentication (get), not create.
      prf: {},
    },
  };

  const credential = (await navigator.credentials.create({
    publicKey: options as PublicKeyCredentialCreationOptions,
  })) as PublicKeyCredential | null;

  if (!credential) throw new Error('Credential creation was cancelled.');

  const prfExt = getPrfExtensionResults(credential);
  let prfOutput = getPrfOutput(credential);

  if (!prfOutput) {
    if (prfExt?.enabled === false) {
      throw new Error(prfUnsupportedMessage());
    }
    // Android Chrome (and most passkey providers) only return PRF on authentication.
    prfOutput = await assertForPrfOutput(credential.rawId);
  }

  const wrappingKey = await deriveWrappingKey(prfOutput);
  const { wrapped, iv } = await wrapPassword(wrappingKey, masterPassword);

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
 */
export async function unlockWithBiometric(): Promise<string> {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) throw new Error('No biometric credential registered on this device.');

  const stored: StoredBiometricCredential = JSON.parse(raw);
  const credentialId = b64urlDecode(stored.credentialId);

  const prfOutput = await assertForPrfOutput(credentialId);
  const wrappingKey = await deriveWrappingKey(prfOutput);

  const wrapped = b64urlDecode(stored.wrappedPassword);
  const iv = new Uint8Array(b64urlDecode(stored.wrapIv));

  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrappingKey, wrapped);
  } catch {
    throw new Error(
      'Failed to decrypt credential. Re-enable biometric unlock with your master password.',
    );
  }

  return new TextDecoder().decode(decrypted);
}

/** Removes the stored biometric credential from localStorage. */
export function disableBiometric(): void {
  localStorage.removeItem(STORAGE_KEY);
}

/** Whether setup on this platform typically needs a second biometric prompt. */
export function biometricSetupNeedsSecondPrompt(): boolean {
  return isAndroid();
}
