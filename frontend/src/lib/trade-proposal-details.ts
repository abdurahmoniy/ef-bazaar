import type { MessageResponse } from './marketplace-types';
import type { PendingProposal } from '@/components/chat/trade-context';

/** Live information belongs to a message only when the proposal IDs match. */
export function tradeProposalDetails(message: MessageResponse, proposal: PendingProposal | null, locallyRejected = false) {
  const matching = message.proposalId && message.proposalId === proposal?.id ? proposal : null;
  const rawPrice = message.content.trim() ? Number(message.content) : NaN;
  const price = Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : matching?.priceUzs;
  const kind = message.proposalKind ?? matching?.kind ?? (price === 0 ? 'SWAP' : undefined);
  const listingId = message.proposalListingId ?? matching?.listingId;
  const expiresAt = message.proposalExpiresAt ?? matching?.expiresAt;
  const expired = !!expiresAt && Date.parse(expiresAt) <= Date.now();
  const recorded = message.proposalOutcome;
  const outcome: keyof typeof PROPOSAL_STATUS_LABELS = recorded && recorded !== 'PENDING' ? recorded
    : message.proposalTradeId ? 'ACCEPTED'
    : locallyRejected ? 'REJECTED'
    : expired ? 'EXPIRED'
    : matching ? 'PENDING' : 'UNKNOWN';
  return { matching, price, kind, listingId, expiresAt, outcome };
}

export const PROPOSAL_STATUS_LABELS = {
  PENDING: 'Kutilmoqda', ACCEPTED: 'Qabul qilingan', REJECTED: 'Rad etilgan',
  EXPIRED: 'Muddati tugagan', UNKNOWN: 'Holati noma’lum',
};
