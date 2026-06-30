import { db } from './db';
import { CryptoWorkerClient } from './cryptoWorkerClient';
import type { CreditCardData, LocalVaultCard, PlainVaultCard } from '../types/vault';
import { cardPayload, parseCardPayload } from '../types/vault';

export async function getAllVaultCards(): Promise<LocalVaultCard[]> {
  return db.cards.orderBy('updated_at').reverse().toArray();
}

export async function saveVaultCard(
  card: CreditCardData & { id: string },
): Promise<void> {
  const crypto = CryptoWorkerClient.getInstance();
  const { encryptedTitle, encryptedContent, iv } = await crypto.encrypt(
    card.cardName,
    cardPayload(card),
  );
  const now = new Date().toISOString();
  const existing = await db.cards.get(card.id);

  await db.cards.put({
    id: card.id,
    encrypted_title: encryptedTitle,
    encrypted_content: encryptedContent,
    iv,
    updated_at: now,
    created_at: existing?.created_at ?? now,
  });
}

export async function deleteVaultCard(id: string): Promise<void> {
  await db.cards.delete(id);
}

export async function loadPlainVaultCards(): Promise<PlainVaultCard[]> {
  const crypto = CryptoWorkerClient.getInstance();
  const rows = await getAllVaultCards();
  const cards: PlainVaultCard[] = [];

  for (const row of rows) {
    try {
      const { title, content } = await crypto.decrypt(
        row.encrypted_title,
        row.encrypted_content,
        row.iv,
      );
      const data = parseCardPayload(title, content);
      cards.push({
        id: row.id,
        ...data,
        updated_at: row.updated_at,
        created_at: row.created_at,
      });
    } catch {
      // Skip cards that fail decryption (wrong key / corrupt)
    }
  }

  return cards;
}

export async function clearAllVaultCards(): Promise<void> {
  await db.cards.clear();
}
