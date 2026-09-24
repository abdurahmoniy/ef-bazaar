'use client';

import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { roleInRequest } from '@/lib/account-request';
import type { MessageResponse } from '@/lib/marketplace-types';
import { canUseSmartAdmin, resolveTradeListing } from '@/lib/trade-platform';
import { tradeProposalDetails } from '@/lib/trade-proposal-details';
import { useTradeContext } from './trade-context';

export function TradeProposalRetryButton({ message }: { message: MessageResponse }) {
  const { viewerId, listing, accountRequest, proposal, activeTrade, trades,
    setProposal, setStartingNew, setIsDrawerOpen, setShowAcceptModal, setShowProposeModal } = useTradeContext();
  const { outcome, listingId, matching } = tradeProposalDetails(message, proposal);
  const selectedListing = resolveTradeListing(accountRequest, listing);

  // Reuse the current seller flow only for this account; an old offer must not
  // replace a newer negotiation or silently propose a different account.
  if (outcome !== 'EXPIRED' || message.senderId !== viewerId || trades === null || activeTrade
    || (proposal && !matching) || roleInRequest(accountRequest, viewerId) !== 'SELLER'
    || !listingId || listingId !== selectedListing?.id || !canUseSmartAdmin(selectedListing)) return null;

  return (
    <Button type="button" size="sm" className="min-h-11 w-full" onClick={() => {
      if (matching) setProposal(null);
      setStartingNew(true);
      setShowAcceptModal(false);
      setIsDrawerOpen(false);
      setShowProposeModal(true);
    }}>
      <RotateCcw className="h-4 w-4" aria-hidden="true" />
      Qayta taklif yuborish
    </Button>
  );
}
