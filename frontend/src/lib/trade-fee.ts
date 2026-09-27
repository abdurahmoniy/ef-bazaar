import type { AdminFeePayer, TradeFeeQuote } from './trade-types';

export function splitAdminFee(feeTiyin: number, payer: AdminFeePayer) {
  const seller = payer === 'SELLER' ? feeTiyin : payer === 'SPLIT' ? Math.floor(feeTiyin / 2) : 0;
  return { seller, buyer: feeTiyin - seller };
}

export function feePayerLabel(payer: AdminFeePayer | null | undefined, sellerId: string, viewerId: string): string {
  if (payer === 'SPLIT') return 'Teng bo‘linadi';
  return ((payer ?? 'SELLER') === 'SELLER') === (sellerId === viewerId) ? 'Siz' : 'Sherigingiz';
}

export function proposalHoldTiyin(
  proposal: TradeFeeQuote & { sellerId: string; buyerId: string; priceUzs: number },
  viewerId: string,
): number {
  if (viewerId !== proposal.sellerId && viewerId !== proposal.buyerId) return 0;
  const buyer = viewerId === proposal.buyerId;
  const quoted = buyer ? proposal.buyerHoldTiyin : proposal.sellerHoldTiyin;
  if (quoted != null && Number.isSafeInteger(quoted) && quoted >= 0) return quoted;
  return buyer ? proposal.priceUzs * 100 : 0;
}
