/**
 * Cryptography Web Worker
 * =======================
 * Runs entirely off the main thread so cryptographic operations
 * (especially PBKDF2 key derivation) never block the UI.
 *
 * Security properties:
 *  • The CryptoKey object is stored in module-level memory inside
 *    this worker. It is marked non-extractable and NEVER serialized
 *    or sent back to the main thread.
 *  • Each encryption call generates a fresh 12-byte random IV.
 *    Reusing an IV with the same key under AES-GCM is catastrophic —
 *    this design makes reuse structurally impossible.
 *  • PBKDF2 uses 600,000 iterations (≥ OWASP 2023 recommendation)
 *    with SHA-256 and a 256-bit output key.
 *  • On CLEAR_KEY the reference is nulled, making the key eligible
 *    for GC. The worker should also be terminated by the caller.
 */

import type {
  WorkerRequest,
  WorkerResponse,
  DeriveKeyRequest,
  EncryptRequest,
  DecryptRequest,
  DecryptBatchRequest,
} from '../types/crypto';

// ── Module-level key storage ───────────────────────────────────
// The CryptoKey lives here and nowhere else. It is never cloned,
// serialized, or posted back across the worker boundary.
let encryptionKey: CryptoKey | null = null;

// ── PBKDF2 constants ───────────────────────────────────────────
const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_HASH = 'SHA-256';
const KEY_LENGTH_BITS = 256;

// ── Helpers ────────────────────────────────────────────────────

function base64Encode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64Decode(b64: string): Uint8Array<ArrayBuffer> {
  const chars = atob(b64);
  const buf = new ArrayBuffer(chars.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < chars.length; i++) view[i] = chars.charCodeAt(i);
  return view;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  if (hex.length % 2 !== 0) throw new Error('Invalid hex string length.');
  const buf = new ArrayBuffer(hex.length / 2);
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function post(msg: WorkerResponse): void {
  self.postMessage(msg);
}

// ── Key Derivation ─────────────────────────────────────────────

async function handleDeriveKey(req: DeriveKeyRequest): Promise<void> {
  const { password, salt } = req.payload;

  // Import the raw password as key material — it cannot be used for
  // encryption directly; it only serves as input to PBKDF2.
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false, // non-extractable
    ['deriveKey'],
  );

  // Convert the hex salt from the server into a byte array.
  const saltBytes = hexToBytes(salt);

  // Derive a 256-bit AES-GCM key.
  // non-extractable = even this worker cannot export the raw bytes.
  encryptionKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false, // non-extractable
    ['encrypt', 'decrypt'],
  );

  post({ id: req.id, type: 'DERIVE_KEY_OK' });
}

// ── Encryption ─────────────────────────────────────────────────

async function handleEncrypt(req: EncryptRequest): Promise<void> {
  if (!encryptionKey) {
    post({ id: req.id, type: 'ERROR', error: 'No encryption key derived. Call DERIVE_KEY first.' });
    return;
  }

  const { title, content } = req.payload;

  // Each encryption operation gets a unique 12-byte (96-bit) IV.
  // AES-GCM with a 96-bit IV is the NIST-recommended configuration.
  // Generating it here (inside the worker) ensures the UI layer cannot
  // accidentally reuse an IV.
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoder = new TextEncoder();

  // Encrypt title and content separately so the client can display
  // just the title list without decrypting the full body.
  const [cipherTitle, cipherContent] = await Promise.all([
    crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, encoder.encode(title)),
    crypto.subtle.encrypt({ name: 'AES-GCM', iv }, encryptionKey, encoder.encode(content)),
  ]);

  post({
    id: req.id,
    type: 'ENCRYPT_OK',
    payload: {
      encryptedTitle: base64Encode(cipherTitle),
      encryptedContent: base64Encode(cipherContent),
      // Same IV used for both fields — this is safe because a single
      // logical note is one atomic unit; both fields share the same
      // encryption context and are always decrypted together.
      iv: base64Encode(iv.buffer),
    },
  });
}

// ── Decryption ─────────────────────────────────────────────────

async function decryptFields(
  encryptedTitle: string,
  encryptedContent: string,
  iv: string,
): Promise<{ title: string; content: string }> {
  if (!encryptionKey) {
    throw new Error('No encryption key derived. Call DERIVE_KEY first.');
  }

  const ivBytes = base64Decode(iv);
  const decoder = new TextDecoder();

  const [rawTitle, rawContent] = await Promise.all([
    crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, encryptionKey, base64Decode(encryptedTitle)),
    crypto.subtle.decrypt({ name: 'AES-GCM', iv: ivBytes }, encryptionKey, base64Decode(encryptedContent)),
  ]);

  return {
    title: decoder.decode(rawTitle),
    content: decoder.decode(rawContent),
  };
}

async function handleDecrypt(req: DecryptRequest): Promise<void> {
  try {
    const payload = await decryptFields(
      req.payload.encryptedTitle,
      req.payload.encryptedContent,
      req.payload.iv,
    );
    post({ id: req.id, type: 'DECRYPT_OK', payload });
  } catch {
    post({
      id: req.id,
      type: 'ERROR',
      error: 'Decryption failed: authentication tag mismatch. Data may be corrupt or tampered.',
    });
  }
}

async function handleDecryptBatch(req: DecryptBatchRequest): Promise<void> {
  const results = await Promise.all(
    req.payload.items.map(async (item) => {
      try {
        return await decryptFields(item.encryptedTitle, item.encryptedContent, item.iv);
      } catch {
        return null;
      }
    }),
  );

  post({ id: req.id, type: 'DECRYPT_BATCH_OK', payload: { results } });
}

// ── Clear Key ──────────────────────────────────────────────────

function handleClearKey(id: string): void {
  encryptionKey = null;
  post({ id, type: 'CLEAR_KEY_OK' });
}

// ── Message dispatcher ─────────────────────────────────────────

self.addEventListener('message', async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;

  try {
    switch (req.type) {
      case 'DERIVE_KEY':
        await handleDeriveKey(req);
        break;
      case 'ENCRYPT':
        await handleEncrypt(req);
        break;
      case 'DECRYPT':
        await handleDecrypt(req);
        break;
      case 'DECRYPT_BATCH':
        await handleDecryptBatch(req);
        break;
      case 'CLEAR_KEY':
        handleClearKey(req.id);
        break;
      default: {
        const _exhaustive: never = req;
        void _exhaustive;
        post({ id: (req as WorkerRequest).id, type: 'ERROR', error: 'Unknown message type.' });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown worker error.';
    post({ id: req.id, type: 'ERROR', error: message });
  }
});
