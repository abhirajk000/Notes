'use client';

import { CreditCard, Plus } from 'lucide-react';
import type { PlainVaultCard } from '../types/vault';
import { maskCardLabel } from '../types/vault';

interface VaultCardListProps {
  cards: PlainVaultCard[];
  selectedId: string | null;
  isLoading: boolean;
  onSelect: (id: string) => void;
  onAddCard: () => void;
}

export function VaultCardList({
  cards,
  selectedId,
  isLoading,
  onSelect,
  onAddCard,
}: VaultCardListProps) {
  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col p-3 gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-14 rounded-xl bg-gray-200 dark:bg-zinc-700 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2">
        <button
          onClick={onAddCard}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white/70 dark:bg-zinc-700/60 hover:bg-white dark:hover:bg-zinc-700 text-sm font-medium text-gray-700 dark:text-gray-200 transition-colors shadow-sm"
        >
          <Plus size={15} className="text-indigo-500" />
          Add Card
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
            <CreditCard size={22} className="text-indigo-500" />
          </div>
          <p className="text-sm text-gray-400 dark:text-gray-500 leading-relaxed">
            No cards saved yet.
            <br />
            Tap <strong>Add Card</strong> to store one securely.
          </p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => onSelect(card.id)}
              className={`
                w-full text-left px-4 py-3.5 border-b border-gray-100 dark:border-zinc-700/50
                transition-colors flex items-center gap-3
                ${
                  selectedId === card.id
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-l-indigo-500'
                    : 'hover:bg-gray-100 dark:hover:bg-zinc-700/40 border-l-2 border-l-transparent'
                }
              `}
            >
              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-800 to-indigo-950 flex items-center justify-center flex-shrink-0">
                <CreditCard size={16} className="text-indigo-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {card.cardName || 'Untitled Card'}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                  {maskCardLabel(card.cardNumber)}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
