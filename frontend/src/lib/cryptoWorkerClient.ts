/**
 * CryptoWorkerClient
 * ==================
 * Main-thread façade for the crypto Web Worker.
 *
 * Converts the fire-and-forget postMessage/onmessage API into proper
 * async/await Promises using a correlation-ID map. Each call gets a
 * unique UUID that is included in both the request and the response,
 * so concurrent calls never collide.
 *
 * Usage:
 *   const crypto = CryptoWorkerClient.getInstance();
 *   await crypto.deriveKey(password, salt);
 *   const { encryptedTitle, encryptedContent, iv } = await crypto.encrypt('My Note', 'Body');
 *   const { title, content } = await crypto.decrypt(encTitle, encContent, iv);
 *   crypto.destroy(); // on logout
 */

import type {
  WorkerRequest,
  WorkerResponse,
  EncryptResponse,
  DecryptResponse,
  DecryptBatchResponse,
} from '../types/crypto';

type PendingCall = {
  resolve: (value: WorkerResponse) => void;
  reject: (reason: Error) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

const WORKER_TIMEOUT_MS = 30_000; // 30 s — PBKDF2 may take several seconds

export class CryptoWorkerClient {
  private static instance: CryptoWorkerClient | null = null;

  private worker: Worker;
  private pending = new Map<string, PendingCall>();

  private constructor() {
    // Next.js (webpack 5) resolves this URL at build time and emits
    // the worker as a separate static chunk.
    this.worker = new Worker(
      new URL('../workers/crypto.worker.ts', import.meta.url),
    );

    this.worker.addEventListener('message', this.handleMessage.bind(this));
    this.worker.addEventListener('error', this.handleError.bind(this));
  }

  /** Returns the singleton instance, creating it if necessary. */
  static getInstance(): CryptoWorkerClient {
    if (!CryptoWorkerClient.instance) {
      CryptoWorkerClient.instance = new CryptoWorkerClient();
    }
    return CryptoWorkerClient.instance;
  }

  /** Eagerly spin up the worker so the first deriveKey is faster. */
  static warmUp(): void {
    CryptoWorkerClient.getInstance();
  }

  // ── Internal plumbing ────────────────────────────────────────

  private generateId(): string {
    return crypto.randomUUID();
  }

  private handleMessage(event: MessageEvent<WorkerResponse>): void {
    const response = event.data;
    const pending = this.pending.get(response.id);
    if (!pending) return;

    clearTimeout(pending.timeoutHandle);
    this.pending.delete(response.id);

    if (response.type === 'ERROR') {
      pending.reject(new Error(response.error));
    } else {
      pending.resolve(response);
    }
  }

  private handleError(event: ErrorEvent): void {
    // Broadcast worker-level errors to all pending callers
    const message = event.message ?? 'Crypto worker crashed.';
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeoutHandle);
      pending.reject(new Error(message));
      this.pending.delete(id);
    }
  }

  private send(request: WorkerRequest): Promise<WorkerResponse> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error(`Crypto worker timed out on: ${request.type}`));
      }, WORKER_TIMEOUT_MS);

      this.pending.set(request.id, { resolve, reject, timeoutHandle });
      this.worker.postMessage(request);
    });
  }

  // ── Public API ───────────────────────────────────────────────

  /**
   * Derives the AES-GCM encryption key from the user's master password
   * and the per-user salt fetched from the backend.
   *
   * This is the most expensive call (~1–3 s on mobile). Show a spinner.
   * The derived CryptoKey stays inside the worker — it never crosses
   * the worker boundary back to the main thread.
   */
  async deriveKey(password: string, salt: string): Promise<void> {
    await this.send({ id: this.generateId(), type: 'DERIVE_KEY', payload: { password, salt } });
  }

  /**
   * Encrypts a note's title and content.
   * Returns base64-encoded ciphertext strings and a fresh base64 IV.
   */
  async encrypt(
    title: string,
    content: string,
  ): Promise<{ encryptedTitle: string; encryptedContent: string; iv: string }> {
    const response = (await this.send({
      id: this.generateId(),
      type: 'ENCRYPT',
      payload: { title, content },
    })) as EncryptResponse;

    return response.payload;
  }

  /**
   * Decrypts a note's title and content.
   * Throws if the auth tag doesn't match (tampered / wrong key).
   */
  async decrypt(
    encryptedTitle: string,
    encryptedContent: string,
    iv: string,
  ): Promise<{ title: string; content: string }> {
    const response = (await this.send({
      id: this.generateId(),
      type: 'DECRYPT',
      payload: { encryptedTitle, encryptedContent, iv },
    })) as DecryptResponse;

    return response.payload;
  }

  /** Decrypt many notes/cards in one worker round-trip (parallel inside worker). */
  async decryptBatch(
    items: Array<{ encryptedTitle: string; encryptedContent: string; iv: string }>,
  ): Promise<Array<{ title: string; content: string } | null>> {
    if (items.length === 0) return [];

    const response = (await this.send({
      id: this.generateId(),
      type: 'DECRYPT_BATCH',
      payload: { items },
    })) as DecryptBatchResponse;

    return response.payload.results;
  }

  /**
   * Nulls the in-memory CryptoKey inside the worker and terminates
   * the worker process. Call this on logout.
   */
  async destroy(): Promise<void> {
    try {
      await this.send({ id: this.generateId(), type: 'CLEAR_KEY' });
    } finally {
      this.worker.terminate();
      CryptoWorkerClient.instance = null;
    }
  }
}
