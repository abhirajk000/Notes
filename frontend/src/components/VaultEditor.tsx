'use client';

import { useEffect, useState } from 'react';
import { Trash2, Save } from 'lucide-react';
import { CreditCardVaultItem } from './CreditCardVaultItem';
import type { CreditCardData, PlainVaultCard } from '../types/vault';
import { EMPTY_CARD } from '../types/vault';

interface VaultEditorProps {
  card: PlainVaultCard | null;
  isSaving: boolean;
  onSave: (data: CreditCardData) => void;
  onDelete: () => void;
}

export function VaultEditor({ card, isSaving, onSave, onDelete }: VaultEditorProps) {
  const [draft, setDraft] = useState<CreditCardData>(EMPTY_CARD);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (card) {
      setDraft({
        cardName: card.cardName,
        cardHolder: card.cardHolder,
        cardNumber: card.cardNumber,
        expiry: card.expiry,
        cvv: card.cvv,
      });
      setIsDirty(false);
    } else {
      setDraft(EMPTY_CARD);
      setIsDirty(false);
    }
  }, [card?.id]);

  const update = (patch: Partial<CreditCardData>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setIsDirty(true);
  };

  if (!card) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center select-none">
        <div className="w-14 h-14 rounded-3xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-1">
          <span className="text-2xl">💳</span>
        </div>
        <p className="text-base font-medium text-gray-400 dark:text-gray-500">
          Select a card or add a new one
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white dark:bg-[#1c1c1e]">
      <div className="flex items-center gap-2 px-6 py-2.5 border-b border-gray-100 dark:border-zinc-700/60 flex-shrink-0">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-auto">
          {isSaving ? 'Encrypting & saving…' : isDirty ? 'Unsaved changes' : 'Saved locally (encrypted)'}
        </span>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={isSaving || !draft.cardName.trim()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 transition-colors"
        >
          <Save size={14} />
          Save
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
          title="Delete card"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-8 md:px-16 lg:px-24 py-8">
        <div className="mb-10 flex justify-center">
          <CreditCardVaultItem {...draft} />
        </div>

        <div className="max-w-md mx-auto grid gap-4">
          <Field label="Card Name" value={draft.cardName} onChange={(v) => update({ cardName: v })} placeholder="SBI Cashback Card" />
          <Field label="Card Holder" value={draft.cardHolder} onChange={(v) => update({ cardHolder: v })} placeholder="ABHIRAJ K" />
          <Field label="Card Number" value={draft.cardNumber} onChange={(v) => update({ cardNumber: v })} placeholder="4111 1111 1111 1111" mono />
          <div className="grid grid-cols-2 gap-4">
            <Field label="Expiry" value={draft.expiry} onChange={(v) => update({ expiry: v })} placeholder="MM/YY" mono />
            <Field label="CVV" value={draft.cvv} onChange={(v) => update({ cvv: v })} placeholder="•••" mono secret />
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  mono = false,
  secret = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  secret?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 block">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full px-3.5 py-2.5 rounded-xl text-sm bg-gray-50 dark:bg-zinc-800/60 border border-gray-200 dark:border-zinc-600/60 text-gray-900 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400 transition-all ${mono ? 'font-mono' : ''}`}
      />
    </label>
  );
}
