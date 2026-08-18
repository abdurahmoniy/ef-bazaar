import type { TradeCommissionConfig } from './payment-types';

/**
 * The platform's share of a smart-admin trade, mirrored from
 * payment-service's TradeCommission.
 *
 * Configurable via the Admin Panel and stored in payment-service's DB.
 * When no dynamic config is provided, falls back to standard default rates:
 *   price < 100 000 so'm   →  10%,  at least  5 000 so'm
 *   price ≥ 100 000 so'm   →  7.5%, at least 10 000 so'm
 */

export const DEFAULT_TRADE_COMMISSION_CONFIG: TradeCommissionConfig = {
  id: 'DEFAULT',
  bandSom: 100_000,
  lowRatePercent: 10.0,
  highRatePercent: 7.5,
  lowMinSom: 5_000,
  highMinSom: 10_000,
  active: true,
  updatedAt: new Date().toISOString(),
};

/** @param priceSom the listed price in so'm */
export function tradeFeeSom(
  priceSom: number,
  config?: TradeCommissionConfig | null
): number {
  if (!Number.isFinite(priceSom) || priceSom <= 0) return 0;

  const cfg = config ?? DEFAULT_TRADE_COMMISSION_CONFIG;
  const low = priceSom < cfg.bandSom;
  const ratePercent = low ? cfg.lowRatePercent : cfg.highRatePercent;
  const floor = low ? cfg.lowMinSom : cfg.highMinSom;

  // Floor calculation in whole so'm: truncates to match backend integer arithmetic
  const calculated = Math.floor((priceSom * ratePercent) / 100);
  const fee = Math.max(calculated, floor);

  return Math.min(fee, priceSom);
}

/** What the seller actually receives. */
export function sellerProceedsSom(
  priceSom: number,
  config?: TradeCommissionConfig | null
): number {
  if (!Number.isFinite(priceSom) || priceSom <= 0) return 0;
  return priceSom - tradeFeeSom(priceSom, config);
}

export function minimumViablePriceSom(
  config?: TradeCommissionConfig | null
): number {
  const cfg = config ?? DEFAULT_TRADE_COMMISSION_CONFIG;
  return cfg.lowMinSom;
}

/** Legacy constant for backwards compatibility */
export const MIN_TRADE_PRICE_SOM = 5_000;
