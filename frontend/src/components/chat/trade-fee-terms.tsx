import { feePayerLabel } from '@/lib/trade-fee';
import { formatTiyin } from '@/lib/money';
import { isSwap } from '@/lib/trade-swap';
import type { PendingProposal } from './trade-context';

export function TradeFeeTerms({ proposal, viewerId }: { proposal: PendingProposal; viewerId: string }) {
  if (!isSwap(proposal.kind)) return null;
  return <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-3 text-xs">
    <p>Admin haqini to‘laydi: <strong>{feePayerLabel(proposal.adminFeePayer, proposal.sellerId, viewerId)}</strong></p>
    {proposal.adminFeeTiyin != null && <p>Jami xizmat haqi: <strong>{formatTiyin(proposal.adminFeeTiyin)} so‘m</strong></p>}
    {proposal.sellerHoldTiyin != null && proposal.buyerHoldTiyin != null && <>
      <p>Sizning hamyoningizdan: {formatTiyin(viewerId === proposal.sellerId ? proposal.sellerHoldTiyin : proposal.buyerHoldTiyin)} so‘m</p>
      <p>Sherigingiz hamyonidan: {formatTiyin(viewerId === proposal.sellerId ? proposal.buyerHoldTiyin : proposal.sellerHoldTiyin)} so‘m</p>
    </>}
  </div>;
}
