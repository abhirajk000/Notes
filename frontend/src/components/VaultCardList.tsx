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
          <div key={i} className="h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/30 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2">
        <button
          onClick={onAddCard}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-violet-950/30 hover:bg-violet-50 dark:hover:bg-violet-950/50 text-sm font-medium text-gray-700 dark:text-gray-200 transition-all shadow-soft border border-violet-100/60 dark:border-violet-800/30"
        >
          <Plus size={15} className="text-accent" />
          Add Card
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="soft-icon-box w-14 h-14">
            <CreditCard size={24} className="text-accent/70" />
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
                w-full text-left px-4 py-3.5 border-b border-violet-50 dark:border-violet-900/15
                transition-all duration-200 flex items-center gap-3
                ${
                  selectedId === card.id
                    ? 'bg-accent-muted dark:bg-accent-muted-dark border-l-2 border-l-accent'
                    : 'hover:bg-violet-50/60 dark:hover:bg-violet-950/20 border-l-2 border-l-transparent'
                }
              `}
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-700 to-purple-900 flex items-center justify-center flex-shrink-0 shadow-soft">
                <CreditCard size={16} className="text-violet-200" />
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
