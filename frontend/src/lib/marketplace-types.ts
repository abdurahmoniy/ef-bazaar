export type ListingStatus = 'ACTIVE' | 'SOLD' | 'DELETED';
export type ChatStatus = 'ACTIVE' | 'CLOSED' | 'EXPIRED';

export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ListingResponse {
  id: string;
  sellerId: string;
  description: string;
  valuablePlayers: string[];
  hasGooglePlayLink: boolean;
  highestDivisionLevel: number;
  androidCoins: number;
  iosCoins: number;
  teamStrength: number;
  price: number | string;
  priceNegotiable: boolean;
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
  minDivision?: number;
  maxDivision?: number;
  minTeamStrength?: number;
  hasGooglePlayLink?: boolean;
  priceNegotiable?: boolean;
  valuablePlayer?: string;
  search?: string;
}

export interface ListingCreateRequest {
  description: string;
  valuablePlayers: string[];
  hasGooglePlayLink: boolean;
  highestDivisionLevel: number;
  androidCoins: number;
  iosCoins: number;
  teamStrength: number;
  price: number;
  priceNegotiable: boolean;
}

export type ListingUpdateRequest = Partial<ListingCreateRequest>;

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
