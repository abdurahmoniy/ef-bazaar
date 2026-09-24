'use client';

import { Button } from '@/components/ui/button';
import type { MessageResponse } from '@/lib/marketplace-types';
import { tradeProposalDetails } from '@/lib/trade-proposal-details';
import { canRejectTradeProposal } from '@/lib/trade-types';
import { useTradeContext } from './trade-context';

export function TradeProposalRejectButton({ message }: { message?: MessageResponse }) {
  const { proposal, viewerId, setRejectProposalId, rejectedProposalIds } = useTradeContext();
  if (!proposal || !canRejectTradeProposal(proposal, viewerId) || rejectedProposalIds?.has(proposal.id)) return null;
  if (message) {
    const { matching, outcome } = tradeProposalDetails(message, proposal);
    if (!matching || outcome !== 'PENDING') return null;
  }
  return <Button type="button" size="sm" variant="outline" className="min-h-11 text-destructive"
    onClick={() => setRejectProposalId(proposal.id)}>Rad etish</Button>;
}
