/**
 * "Akkountlarim" — foydalanuvchi egalik qiladigan eFootball akkountlari.
 *
 * E'lon endi akkountning holati: `onMarket` true bo'lsa u bozorda turibdi.
 * `email` faqat egasining javobida bo'ladi va e'longa hech qachon ko'chmaydi.
 */

export type UserAccountStatus = 'ACTIVE' | 'ARCHIVED';
/** CUSTOM — user o'zi olgan nomli quti (Konami ulanishi tasdiqlangan). */
export type AccountEmailSource = 'MANUAL' | 'PLATFORM' | 'CUSTOM';
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
  /** Platforma Konami akkount shu pochtaga ulanganini tasdiqlagan. */
  emailVerified: boolean;
  status: UserAccountStatus;
  archivedReason?: AccountArchivedReason | null;
  /** Qachon sotilgan / obmen qilingan. Faqat ARCHIVED da. */
  archivedAt?: string | null;
  /** Sotilgan paytdagi e'lon narxi; obmenda va eski yozuvlarda yo'q. */
  soldPrice?: number | string | null;
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
