export type ListingStatus = 'ACTIVE' | 'SOLD' | 'DELETED';
export type ChatStatus = 'ACTIVE' | 'CLOSED' | 'EXPIRED';
export type AttributeType =
  | 'INT'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'STRING'
  | 'TEXT'
  | 'LIST_STRING'
  | 'ENUM'
  | 'CARD_LIST';

export type AttributeConstraints = Record<string, unknown>;

export interface ListingAttributeDefinition {
  key: string;
  labelUz: string;
  type: AttributeType;
  required: boolean;
  constraints?: AttributeConstraints | null;
  position?: number;
  groupKey?: string | null;
  searchable?: boolean;
  active?: boolean;
}

export interface AttributeDefinitionResponse extends ListingAttributeDefinition {
  id: string;
  position: number;
  groupKey?: string | null;
  searchable: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

/**
 * Dynamic attribute payload keyed by AttributeDefinition.key. Values match the
 * definition type (INT/DECIMAL → number, BOOLEAN → boolean, STRING/TEXT → string,
 * LIST_STRING → string[], ENUM → string). Consumers read known keys defensively
 * because inactive definitions may still appear on old listings.
 */
export type ListingAttributes = Record<string, unknown>;

export interface ListingResponse {
  id: string;
  sellerId: string;
  description: string;
  price: number | string;
  priceNegotiable: boolean;
  attributes: ListingAttributes;
  /** Legacy backend name; values are Telegram file_id strings for /bot/photo/{fileId}. */
  mediaMessageIds: string[];
  status: ListingStatus;
  soldAt?: string | null;
  forwardCount: number;
  likeCount: number;
  likedByMe?: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface ListingBrowseParams {
  page?: number;
  size?: number;
  sort?: string;
  minPrice?: number;
  maxPrice?: number;
  priceNegotiable?: boolean;
  search?: string;
  /** Equality filters on JSONB attributes — sent as {@code ?attr.<key>=<value>}. */
  attributes?: Record<string, string>;
}

export interface ListingCreateRequest {
  description: string;
  price: number;
  priceNegotiable: boolean;
  attributes: ListingAttributes;
}

export type ListingUpdateRequest = Partial<ListingCreateRequest>;

// ---------- helpers ----------

/** Read a numeric attribute, returning {@code undefined} if missing / not a number. */
export function attributeNumber(listing: ListingResponse, key: string): number | undefined {
  const raw = listing.attributes?.[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export function attributeBoolean(listing: ListingResponse, key: string): boolean {
  const raw = listing.attributes?.[key];
  return raw === true || raw === 'true';
}

/** Read a STRING/ENUM attribute, returning {@code undefined} if missing or blank. */
export function attributeString(listing: ListingResponse, key: string): string | undefined {
  const raw = listing.attributes?.[key];
  return typeof raw === 'string' && raw.trim() ? raw : undefined;
}

/**
 * True when the seller accepts an account exchange in any form —
 * mirrors the `exchange_mode` ENUM options minus NONE.
 */
export function listingAcceptsExchange(listing: ListingResponse): boolean {
  const mode = attributeString(listing, 'exchange_mode');
  return mode === 'EXCHANGE_ONLY' || mode === 'EXCHANGE_WITH_SURCHARGE' || mode === 'BOTH';
}

export function attributeStringList(listing: ListingResponse, key: string): string[] {
  const raw = listing.attributes?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

/**
 * Public-facing shape for a valuable_players entry after CARD_LIST migration.
 * Backend stores snake_case; helpers below normalize to something the display
 * components can consume directly (name plus the badges we care about).
 */
export interface AttachedPlayerCard {
  efhubId: number;
  name: string;
  overallRating?: number;
  cardType?: string;
  playingStyle?: string;
  position?: string;
  imageUrl?: string;
}

/**
 * Read valuable_players (or any CARD_LIST attribute) as an array of card
 * summaries. Legacy string-only entries (older listings from before the
 * schema flip) are surfaced as {@code {efhubId: 0, name: <string>}} so the
 * display components can still render something meaningful.
 */
export function attributeCardList(listing: ListingResponse, key: string): AttachedPlayerCard[] {
  const raw = listing.attributes?.[key];
  if (!Array.isArray(raw)) return [];
  const out: AttachedPlayerCard[] = [];
  for (const entry of raw) {
    if (typeof entry === 'string') {
      out.push({ efhubId: 0, name: entry });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const item = entry as Record<string, unknown>;
    const efhubIdRaw = (item.efhubId ?? item.efhub_id);
    const name = item.name;
    if (typeof name !== 'string') continue;
    out.push({
      efhubId: typeof efhubIdRaw === 'number' ? efhubIdRaw : 0,
      name,
      overallRating: typeof (item.overallRating ?? item.overall_rating) === 'number'
        ? Number(item.overallRating ?? item.overall_rating)
        : undefined,
      cardType: typeof (item.cardType ?? item.card_type) === 'string'
        ? String(item.cardType ?? item.card_type)
        : undefined,
      playingStyle: typeof (item.playingStyle ?? item.playing_style) === 'string'
        ? String(item.playingStyle ?? item.playing_style)
        : undefined,
      position: typeof item.position === 'string' ? item.position : undefined,
      imageUrl: typeof (item.imageUrl ?? item.image_url) === 'string'
        ? String(item.imageUrl ?? item.image_url)
        : undefined,
    });
  }
  return out;
}

// ---------- admin ----------

/** POST /admin/attributes payload — mirrors AttributeDefinitionCreateRequest. */
export interface AttributeDefinitionCreatePayload {
  key: string;
  labelUz: string;
  type: AttributeType;
  required: boolean;
  position: number;
  groupKey?: string | null;
  constraints?: unknown;
  searchable?: boolean | null;
}

/** PUT /admin/attributes/{id} payload — `key` is immutable, `active` togglable. */
export interface AttributeDefinitionUpdatePayload {
  labelUz: string;
  type: AttributeType;
  required: boolean;
  position: number;
  groupKey?: string | null;
  constraints?: unknown;
  searchable?: boolean | null;
  active?: boolean | null;
}

export type ReportStatus = 'PENDING' | 'RESOLVED' | 'DISMISSED';

/** Moderation view of a listing report; listing fields are null when the listing row is gone. */
export interface AdminReportResponse {
  id: string;
  listingId: string;
  listingDescription?: string | null;
  listingStatus?: ListingStatus | null;
  sellerId?: string | null;
  sellerName?: string | null;
  reporterId: string;
  reporterName?: string | null;
  reason: string;
  details?: string | null;
  status: ReportStatus;
  createdAt: string;
}

export interface AdminStatsResponse {
  totalListings: number;
  activeListings: number;
  soldListings: number;
  deletedListings: number;
  totalReports: number;
  pendingReports: number;
}

export interface LikeToggleResponse {
  listingId: string;
  liked: boolean;
  totalLikes: number;
}

export interface ChatResponse {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  buyerDisplayName?: string | null;
  sellerDisplayName?: string | null;
  status: ChatStatus;
  important: boolean;
  lastMessageAt?: string | null;
  createdAt: string;
  closedAt?: string | null;
  messageCount: number;
  /** Viewer-specific: partner messages after my read cursor. */
  unreadCount?: number;
  /** Viewer-specific: my read cursor — drives the "new messages" divider. */
  lastReadAt?: string | null;
  /** One-line preview of the newest message (attachment → emoji label). */
  lastMessagePreview?: string | null;
}

export type AttachmentType = 'IMAGE' | 'FILE' | 'VOICE';

export interface MessageResponse {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  attachmentType?: AttachmentType | null;
  attachmentFileId?: string | null;
  attachmentName?: string | null;
  attachmentMime?: string | null;
  attachmentSize?: number | null;
  /** Quoted message id — null when not a reply or the quote was deleted. */
  replyToId?: string | null;
  replySenderId?: string | null;
  replyPreview?: string | null;
  editedAt?: string | null;
  createdAt: string;
}

export type NotificationType = 'CHAT_CREATED' | 'CHAT_MESSAGE';

export interface NotificationResponse {
  id: string;
  type: NotificationType;
  chatId?: string | null;
  listingId?: string | null;
  actorDisplayName?: string | null;
  readAt?: string | null;
  createdAt: string;
}
