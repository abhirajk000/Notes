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
    <div className="relative w-full max-w-md h-56 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-xl border border-slate-800 tracking-wide select-none group font-sans transition-all duration-300 hover:shadow-2xl hover:border-slate-700">
      <div className="flex justify-between items-start mb-8">
        <div className="text-sm font-semibold uppercase tracking-widest text-indigo-300 drop-shadow-sm">
          {cardName || 'Secure Payment Card'}
        </div>
        <button
          type="button"
          onClick={() => setIsMasked((m) => !m)}
          className="text-slate-400 hover:text-white transition-colors p-1 rounded-md hover:bg-white/10"
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
          className="inline-block text-xl md:text-2xl font-mono tracking-wider cursor-pointer hover:text-indigo-200 transition-colors py-1 group/field"
        >
          {formatCardNumber(cardNumber)}
          <span className="opacity-0 group-hover/field:opacity-40 ml-2 transition-opacity inline-block align-middle">
            <Copy size={14} />
          </span>
        </div>
        {copiedField === 'number' && (
          <span className="absolute -top-8 left-0 bg-emerald-600 text-white text-xs px-2 py-1 rounded shadow-md flex items-center gap-1 animate-fade-in">
            <Check size={12} /> Number Copied!
          </span>
        )}
      </div>

      <div className="flex justify-between items-end mt-auto">
        <div className="flex gap-8">
          <div
            role="button"
            tabIndex={0}
            className="relative group/holder cursor-pointer"
            onClick={() => handleCopy(cardHolder, 'holder')}
            onKeyDown={(e) => e.key === 'Enter' && handleCopy(cardHolder, 'holder')}
          >
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Card Holder</div>
            <div className="text-sm font-medium tracking-wide font-mono hover:text-indigo-200 transition-colors">
              {cardHolder || 'VALUED CUSTOMER'}
            </div>
            {copiedField === 'holder' && (
              <span className="absolute -top-8 left-0 bg-emerald-600 text-white text-xs px-2 py-1 rounded shadow-md flex items-center gap-1">
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
            <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">Expires</div>
            <div className="text-sm font-medium font-mono hover:text-indigo-200 transition-colors">
              {expiry || 'MM/YY'}
            </div>
            {copiedField === 'expiry' && (
              <span className="absolute -top-8 left-0 bg-emerald-600 text-white text-xs px-2 py-1 rounded shadow-md flex items-center gap-1">
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
          <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">CVV</div>
          <div className="text-sm font-medium font-mono hover:text-indigo-200 transition-colors">
            {isMasked ? '•••' : cvv}
          </div>
          {copiedField === 'cvv' && (
            <span className="absolute -top-8 right-0 bg-emerald-600 text-white text-xs px-2 py-1 rounded shadow-md flex items-center gap-1 whitespace-nowrap">
              <Check size={12} /> CVV Copied!
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
