'use client';

import { useEffect, useState } from 'react';
import { Trash2, Save, CreditCard } from 'lucide-react';
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
      <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center select-none bg-editor dark:bg-editor-dark relative overflow-hidden">
        <div className="absolute inset-0 bg-mesh-light dark:bg-mesh-dark opacity-50 pointer-events-none" aria-hidden />
        <div className="relative">
          <div className="absolute inset-0 rounded-3xl bg-accent/10 blur-2xl scale-150" aria-hidden />
          <div className="relative soft-icon-box w-[72px] h-[72px]">
            <CreditCard size={30} className="text-accent/70" />
          </div>
        </div>
        <p className="relative font-display text-xl text-gray-600 dark:text-gray-300">
          Select a card
        </p>
        <p className="relative text-sm text-gray-400 dark:text-gray-500">
          Or add a new one to your vault
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-editor dark:bg-editor-dark relative">
      <div className="absolute inset-0 bg-mesh-light dark:bg-mesh-dark opacity-30 pointer-events-none" aria-hidden />

      <div className="relative flex items-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 border-b border-violet-100/40 dark:border-violet-900/15 flex-shrink-0 bg-white/50 dark:bg-white/[0.02] backdrop-blur-sm">
        <span className="text-xs text-gray-400 dark:text-gray-500 mr-auto truncate font-medium">
          {isSaving ? (
            <span className="text-accent">Saving…</span>
          ) : isDirty ? (
            'Unsaved changes'
          ) : (
            'Saved'
          )}
        </span>
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={isSaving || !draft.cardName.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-gradient-to-b from-accent-light to-accent hover:from-accent hover:to-accent-dark text-white disabled:opacity-50 transition-all shadow-soft active:scale-[0.98] min-h-[44px]"
        >
          <Save size={14} />
          Save
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-2.5 rounded-xl text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all min-w-[44px] min-h-[44px] flex items-center justify-center active:scale-95"
          title="Delete card"
        >
          <Trash2 size={15} />
        </button>
      </div>

      <div className="relative flex-1 overflow-y-auto mobile-scroll px-4 sm:px-8 md:px-16 lg:px-24 py-6 sm:py-10 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-12 flex justify-center">
          <CreditCardVaultItem {...draft} />
        </div>

        <div className="max-w-md mx-auto grid gap-5">
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
      <span className="text-[11px] font-semibold tracking-[0.08em] text-gray-500 dark:text-gray-400 mb-2 block uppercase">{label}</span>
      <input
        type={secret ? 'password' : 'text'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`soft-input ${mono ? 'font-mono tracking-wide' : ''}`}
      />
    </label>
  );
}
