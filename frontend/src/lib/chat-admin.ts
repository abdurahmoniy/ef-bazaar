import type { AdminChatResponse } from './chat-admin-types';
import type { MessageResponse } from './marketplace-types';

export type ChatParty = 'BUYER' | 'SELLER';

export const PARTY_LABEL_UZ: Record<ChatParty, string> = {
  BUYER: 'Oluvchi',
  SELLER: 'Sotuvchi',
};

/** Which party wrote the message; null for anything not sent by either (system rows). */
export function partyOf(chat: AdminChatResponse, senderId: string | null | undefined): ChatParty | null {
  if (senderId === chat.sellerId) return 'SELLER';
  if (senderId === chat.buyerId) return 'BUYER';
  return null;
}

/** The party's name for the transcript, falling back to its role. */
export function partyName(chat: AdminChatResponse, party: ChatParty): string {
  const name = party === 'SELLER' ? chat.sellerName : chat.buyerName;
  return name ?? PARTY_LABEL_UZ[party];
}

/**
 * The API pages newest first (page 0 is where the conversation stands now);
 * a transcript reads top to bottom, oldest first.
 */
export function chronological(messages: MessageResponse[]): MessageResponse[] {
  return [...messages].reverse();
}

/** Page number from a search param: a non-negative integer, else 0. */
export function parsePage(value: string | undefined): number {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export const PROPOSAL_OUTCOME_LABEL_UZ: Record<NonNullable<MessageResponse['proposalOutcome']>, string> = {
  PENDING: 'kutilmoqda',
  ACCEPTED: 'qabul qilingan',
  REJECTED: 'rad etilgan',
  EXPIRED: 'muddati tugagan',
};
