import type { TradeKind, TradeMode } from './trade-types';
import type { TradeCommissionConfig } from './payment-types';
import { DEFAULT_TRADE_COMMISSION_CONFIG, MIN_TRADE_PRICE_SOM, sellerProceedsSom } from './trade-commission';

/** Whole so‘m only; keep every submitted amount exact in JSON and calculations. */
export function tradeAmountError(
  kind: TradeKind, value: string, mode: TradeMode = 'SMART', config?: TradeCommissionConfig | null,
): string | null {
  if (kind === 'SWAP') return null;
  if (!value.trim()) return 'Miqdorni kiriting.';
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    return 'Miqdor 0 dan katta butun son bo‘lishi kerak.';
  }
  if (!Number.isSafeInteger(Number(value))) return 'Miqdor juda katta. Kichikroq summa kiriting.';
  const amount = Number(value);
  if (amount < MIN_TRADE_PRICE_SOM) return 'Eng kam miqdor 5 000 so‘m.';
  if (kind === 'SALE' && mode === 'SMART') {
    const cfg = config ?? DEFAULT_TRADE_COMMISSION_CONFIG;
    const rate = amount < cfg.bandSom ? cfg.lowRatePercent : cfg.highRatePercent;
    // The payment service rounds its percentage to permille before charging.
    if (Math.round(rate * 10) >= 1000 || sellerProceedsSom(amount, cfg) <= 0) {
      return 'Smart-admin xizmatidan keyin sizga 0 so‘m qoladi. Sotuv summasini oshiring.';
    }
  }
  return null;
}
