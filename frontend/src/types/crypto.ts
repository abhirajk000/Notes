// ============================================================
// Shared types for the CryptoWorker message protocol.
// Both the main-thread client and the worker itself import
// from this file — guaranteeing compile-time symmetry.
// ============================================================

// ── Inbound messages (main thread → worker) ────────────────────

export interface DeriveKeyRequest {
  id: string;
  type: 'DERIVE_KEY';
  payload: {
    /** User's master password — plaintext, lives only in transit */
    password: string;
    /** 64-char hex salt fetched from the backend (public, per-user) */
    salt: string;
  };
}

export interface EncryptRequest {
  id: string;
  type: 'ENCRYPT';
  payload: {
    title: string;
    content: string;
  };
}

export interface DecryptRequest {
  id: string;
  type: 'DECRYPT';
  payload: {
    /** Base64-encoded AES-GCM ciphertext + 16-byte auth tag */
    encryptedTitle: string;
    /** Base64-encoded AES-GCM ciphertext + 16-byte auth tag */
    encryptedContent: string;
    /** Base64-encoded 12-byte IV */
    iv: string;
  };
}

export interface DecryptBatchRequest {
  id: string;
  type: 'DECRYPT_BATCH';
  payload: {
    items: Array<{
      encryptedTitle: string;
      encryptedContent: string;
      iv: string;
    }>;
  };
}

/** Zero out the in-memory CryptoKey (on logout / session end) */
export interface ClearKeyRequest {
  id: string;
  type: 'CLEAR_KEY';
}

export type WorkerRequest =
  | DeriveKeyRequest
  | EncryptRequest
  | DecryptRequest
  | DecryptBatchRequest
  | ClearKeyRequest;

// ── Outbound messages (worker → main thread) ──────────────────

export interface DeriveKeyResponse {
  id: string;
  type: 'DERIVE_KEY_OK';
}

export interface EncryptResponse {
  id: string;
  type: 'ENCRYPT_OK';
  payload: {
    /** Base64 ciphertext (title) */
    encryptedTitle: string;
    /** Base64 ciphertext (content) */
    encryptedContent: string;
    /** Base64 12-byte IV — unique per encryption call */
    iv: string;
  };
}

export interface DecryptResponse {
  id: string;
  type: 'DECRYPT_OK';
  payload: {
    title: string;
    content: string;
  };
}

export interface DecryptBatchResponse {
  id: string;
  type: 'DECRYPT_BATCH_OK';
  payload: {
    results: Array<{ title: string; content: string } | null>;
  };
}

export interface ClearKeyResponse {
  id: string;
  type: 'CLEAR_KEY_OK';
}

export interface WorkerErrorResponse {
  id: string;
  type: 'ERROR';
  error: string;
}

export type WorkerResponse =
  | DeriveKeyResponse
  | EncryptResponse
  | DecryptResponse
  | DecryptBatchResponse
  | ClearKeyResponse
  | WorkerErrorResponse;
