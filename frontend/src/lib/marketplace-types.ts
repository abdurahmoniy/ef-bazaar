export type ListingStatus = 'ACTIVE' | 'SOLD' | 'DELETED';
export type ChatStatus = 'ACTIVE' | 'CLOSED' | 'EXPIRED';
export type AttributeType =
  | 'INT'
  | 'DECIMAL'
  | 'BOOLEAN'
  | 'STRING'
  | 'TEXT'
  | 'LIST_STRING'
  | 'ENUM';

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

export function attributeStringList(listing: ListingResponse, key: string): string[] {
  const raw = listing.attributes?.[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === 'string');
}

export interface LikeToggleResponse {
  listingId: string;
  liked: boolean;
  totalLikes: number;
}

export interface CartItemResponse {
  id: string;
  listingId: string;
  listing: ListingResponse;
  createdAt: string;
}

export interface ChatResponse {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  status: ChatStatus;
  important: boolean;
  lastMessageAt?: string | null;
  createdAt: string;
  closedAt?: string | null;
  messageCount: number;
}
