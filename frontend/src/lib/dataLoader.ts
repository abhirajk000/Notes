import { getAllNotes } from './db';
import { getAllVaultCards } from './vaultCards';
import { CryptoWorkerClient } from './cryptoWorkerClient';
import { parseCardPayload } from '../types/vault';
import type { PlainNote } from '../types/notes';
import type { PlainVaultCard } from '../types/vault';

function sortNotes(notes: PlainNote[]): PlainNote[] {
  return notes.sort(
    (a, b) =>
      Number(b.is_pinned) - Number(a.is_pinned) ||
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}

/** Load and decrypt all notes in one IndexedDB read + one worker batch. */
export async function loadPlainNotes(): Promise<PlainNote[]> {
  const crypto = CryptoWorkerClient.getInstance();
  const localNotes = await getAllNotes();
  const active = localNotes.filter((n) => n.sync_status !== 'pending_delete');

  if (active.length === 0) return [];

  const results = await crypto.decryptBatch(
    active.map((n) => ({
      encryptedTitle: n.encrypted_title,
      encryptedContent: n.encrypted_content,
      iv: n.iv,
    })),
  );

  const decrypted: PlainNote[] = [];
  for (let i = 0; i < active.length; i++) {
    const plain = results[i];
    if (!plain) continue;
    const note = active[i];
    decrypted.push({
      id: note.id,
      title: plain.title,
      content: plain.content,
      is_pinned: note.is_pinned,
      is_locked: note.is_locked ?? false,
      updated_at: note.updated_at,
      created_at: note.created_at,
    });
  }

  return sortNotes(decrypted);
}

/** Load and decrypt all vault cards in one batch. */
export async function loadPlainVaultCardsFast(): Promise<PlainVaultCard[]> {
  const crypto = CryptoWorkerClient.getInstance();
  const rows = await getAllVaultCards();
  const active = rows.filter((r) => r.sync_status !== 'pending_delete');

  if (active.length === 0) return [];

  const results = await crypto.decryptBatch(
    active.map((r) => ({
      encryptedTitle: r.encrypted_title,
      encryptedContent: r.encrypted_content,
      iv: r.iv,
    })),
  );

  const cards: PlainVaultCard[] = [];
  for (let i = 0; i < active.length; i++) {
    const plain = results[i];
    if (!plain) continue;
    const row = active[i];
    const data = parseCardPayload(plain.title, plain.content);
    cards.push({
      id: row.id,
      ...data,
      updated_at: row.updated_at,
      created_at: row.created_at,
    });
  }

  return cards.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );
}
