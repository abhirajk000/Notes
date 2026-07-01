import type { SyncStatus } from './notes';

export interface CreditCardData {
  cardName: string;
  cardHolder: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
}

/** Encrypted card row stored in IndexedDB — plaintext never persisted. */
export interface LocalVaultCard {
  id: string;
  encrypted_title: string;
  encrypted_content: string;
  iv: string;
  sync_status: SyncStatus;
  updated_at: string;
  created_at: string;
}

/** Server vault card payload (ciphertext only). */
export interface ServerVaultCard {
  id: string;
  encrypted_title: string;
  encrypted_content: string;
  iv: string;
  created_at: string;
  updated_at: string;
}

/** Decrypted card kept in React state only. */
export interface PlainVaultCard extends CreditCardData {
  id: string;
  updated_at: string;
  created_at: string;
}

export const EMPTY_CARD: CreditCardData = {
  cardName: '',
  cardHolder: '',
  cardNumber: '',
  expiry: '',
  cvv: '',
};

export function cardPayload(card: CreditCardData): string {
  return JSON.stringify({
    cardHolder: card.cardHolder,
    cardNumber: card.cardNumber.replace(/\s+/g, ''),
    expiry: card.expiry,
    cvv: card.cvv,
  });
}

export function parseCardPayload(cardName: string, json: string): CreditCardData {
  const parsed = JSON.parse(json) as Partial<CreditCardData>;
  return {
    cardName,
    cardHolder: parsed.cardHolder ?? '',
    cardNumber: parsed.cardNumber ?? '',
    expiry: parsed.expiry ?? '',
    cvv: parsed.cvv ?? '',
  };
}

export function maskCardLabel(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s+/g, '');
  if (cleaned.length < 4) return '••••';
  return `•••• ${cleaned.slice(-4)}`;
}
