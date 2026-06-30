'use client';

import { useState, useEffect } from 'react';
import { Eye, EyeOff, Copy, Check } from 'lucide-react';

export interface CreditCardProps {
  cardName: string;
  cardHolder: string;
  cardNumber: string;
  expiry: string;
  cvv: string;
}

export function CreditCardVaultItem({
  cardName,
  cardHolder,
  cardNumber,
  expiry,
  cvv,
}: CreditCardProps) {
  const [isMasked, setIsMasked] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const handleCopy = async (textToCopy: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(textToCopy);
      setCopiedField(fieldName);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  useEffect(() => {
    if (!copiedField) return;
    const timer = setTimeout(() => setCopiedField(null), 2000);
    return () => clearTimeout(timer);
  }, [copiedField]);

  const formatCardNumber = (num: string) => {
    const cleaned = num.replace(/\s+/g, '');
    if (isMasked) {
      const last4 = cleaned.slice(-4);
      return `••••  ••••  ••••  ${last4}`;
    }
    return cleaned.replace(/(.{4})/g, '$1 ').trim();
  };

  return (
    <div className="card-holographic relative w-full max-w-md h-52 sm:h-56 bg-gradient-to-br from-violet-800 via-purple-900 to-violet-950 rounded-3xl p-5 sm:p-7 text-white shadow-soft-xl border border-violet-600/30 tracking-wide select-none group transition-all duration-300 hover:shadow-glow-sm overflow-hidden">
      {/* Decorative chip */}
      <div className="absolute top-6 right-6 w-10 h-8 rounded-md bg-gradient-to-br from-amber-200/80 to-amber-400/60 opacity-80 shadow-inner" aria-hidden />

      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden
      />

      <div className="relative flex justify-between items-start mb-8">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/90">
          {cardName || 'Secure Payment Card'}
        </div>
        <button
          type="button"
          onClick={() => setIsMasked((m) => !m)}
          className="text-violet-300/70 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
          title={isMasked ? 'Show Details' : 'Hide Details'}
        >
          {isMasked ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      <div className="relative mb-6">
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleCopy(cardNumber.replace(/\s+/g, ''), 'number')}
          onKeyDown={(e) => e.key === 'Enter' && handleCopy(cardNumber.replace(/\s+/g, ''), 'number')}
          className="inline-block text-xl md:text-2xl font-mono tracking-[0.15em] cursor-pointer hover:text-violet-200 transition-colors py-1 group/field"
        >
          {formatCardNumber(cardNumber)}
          <span className="opacity-0 group-hover/field:opacity-50 ml-2 transition-opacity inline-block align-middle">
            <Copy size={14} />
          </span>
        </div>
        {copiedField === 'number' && (
          <span className="absolute -top-8 left-0 bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1 animate-fade-in">
            <Check size={12} /> Copied!
          </span>
        )}
      </div>

      <div className="relative flex justify-between items-end mt-auto">
        <div className="flex gap-8">
          <div
            role="button"
            tabIndex={0}
            className="relative group/holder cursor-pointer"
            onClick={() => handleCopy(cardHolder, 'holder')}
            onKeyDown={(e) => e.key === 'Enter' && handleCopy(cardHolder, 'holder')}
          >
            <div className="text-[9px] text-violet-400/80 uppercase tracking-[0.15em] mb-1">Card Holder</div>
            <div className="text-sm font-medium tracking-wide font-mono hover:text-violet-200 transition-colors">
              {cardHolder || 'VALUED CUSTOMER'}
            </div>
            {copiedField === 'holder' && (
              <span className="absolute -top-8 left-0 bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1">
                <Check size={12} /> Copied!
              </span>
            )}
          </div>

          <div
            role="button"
            tabIndex={0}
            className="relative group/expiry cursor-pointer"
            onClick={() => handleCopy(expiry, 'expiry')}
            onKeyDown={(e) => e.key === 'Enter' && handleCopy(expiry, 'expiry')}
          >
            <div className="text-[9px] text-violet-400/80 uppercase tracking-[0.15em] mb-1">Expires</div>
            <div className="text-sm font-medium font-mono hover:text-violet-200 transition-colors">
              {expiry || 'MM/YY'}
            </div>
            {copiedField === 'expiry' && (
              <span className="absolute -top-8 left-0 bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1">
                <Check size={12} /> Copied!
              </span>
            )}
          </div>
        </div>

        <div
          role="button"
          tabIndex={0}
          className="relative group/cvv cursor-pointer text-right"
          onClick={() => handleCopy(cvv, 'cvv')}
          onKeyDown={(e) => e.key === 'Enter' && handleCopy(cvv, 'cvv')}
        >
          <div className="text-[9px] text-violet-400/80 uppercase tracking-[0.15em] mb-1">CVV</div>
          <div className="text-sm font-medium font-mono hover:text-violet-200 transition-colors">
            {isMasked ? '•••' : cvv}
          </div>
          {copiedField === 'cvv' && (
            <span className="absolute -top-8 right-0 bg-emerald-500 text-white text-xs px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1 whitespace-nowrap">
              <Check size={12} /> Copied!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
