'use client';

import { CreditCard, Plus, Sparkles } from 'lucide-react';
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
          <div key={i} className="mx-2 h-[72px] rounded-2xl bg-white/40 dark:bg-white/[0.03] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 py-2 hidden lg:block">
        <button
          onClick={onAddCard}
          className="w-full flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-gradient-to-b from-accent-light to-accent hover:from-accent hover:to-accent-dark text-sm font-semibold text-white transition-all shadow-soft-md hover:shadow-glow-sm active:scale-[0.98] min-h-[44px]"
        >
          <Plus size={15} strokeWidth={2.5} />
          Add Card
        </button>
      </div>

      {cards.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center py-12">
          <div className="relative">
            <div className="absolute inset-0 rounded-3xl bg-accent/10 blur-2xl scale-150" aria-hidden />
            <div className="relative soft-icon-box w-16 h-16">
              <CreditCard size={26} className="text-accent/70" />
            </div>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
              No cards saved yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1.5 leading-relaxed">
              <span className="lg:hidden">Tap <strong>+</strong> to add a card.</span>
              <span className="hidden lg:inline">Tap <strong>Add Card</strong> to store one securely.</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onAddCard}
            className="lg:hidden soft-btn-primary px-6 py-3 text-sm"
          >
            <Sparkles size={14} />
            Add Card
          </button>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto mobile-scroll pb-20 lg:pb-3 pt-1">
          {cards.map((card) => (
            <button
              key={card.id}
              onClick={() => onSelect(card.id)}
              className={`list-item-card flex items-center gap-3 ${selectedId === card.id ? 'list-item-card-selected' : ''}`}
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 via-purple-700 to-violet-900 flex items-center justify-center flex-shrink-0 shadow-card">
                <CreditCard size={16} className="text-violet-200" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {card.cardName || 'Untitled Card'}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-500 font-mono tracking-wide">
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
