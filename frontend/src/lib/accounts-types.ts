/**
 * "Akkountlarim" — foydalanuvchi egalik qiladigan eFootball akkountlari.
 *
 * E'lon endi akkountning holati: `onMarket` true bo'lsa u bozorda turibdi.
 * `email` faqat egasining javobida bo'ladi va e'longa hech qachon ko'chmaydi.
 */

export type UserAccountStatus = 'ACTIVE' | 'ARCHIVED';
export type AccountEmailSource = 'MANUAL' | 'PLATFORM';
export type AccountArchivedReason = 'SOLD_ON_PLATFORM' | 'SOLD_ELSEWHERE' | 'BY_OWNER' | 'SWAPPED_ON_PLATFORM';

/** Optional display data resolved from the current listing and owned mailboxes. */
export interface AccountDisplayData {
  price?: number | string;
  mailboxHref?: string;
}

export interface UserAccountResponse {
  id: string;
  title: string | null;
  description: string | null;
  attributes: Record<string, unknown>;
  mediaMessageIds: string[];
  email: string | null;
  emailSource: AccountEmailSource | null;
  status: UserAccountStatus;
  archivedReason?: AccountArchivedReason | null;
  onMarket: boolean;
  currentListingId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountPayload {
  title?: string | null;
  description?: string | null;
  attributes?: Record<string, unknown>;
  mediaMessageIds?: string[];
}

export interface PublishAccountPayload {
  price: number;
  priceNegotiable: boolean;
  /** null — obmen taklif qilinmaydi. */
  exchangeMode: string | null;
  channelIds: string[];
}
