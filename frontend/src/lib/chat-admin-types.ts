/** Mirrors marketplace-service `uz.efbazaar.marketplace.dto.AdminChatResponse`. */
export interface AdminChatResponse {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  /** "@username" when known, else the display name; null when neither is. */
  buyerName: string | null;
  sellerName: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  messageCount: number;
  lastMessagePreview: string | null;
}
