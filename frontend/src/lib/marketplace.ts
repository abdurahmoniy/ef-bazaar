import 'server-only';

import { apiFetch } from './api';
import { buildListingSearchParams } from './marketplace-format';
import type {
  CartItemResponse,
  ChatResponse,
  LikeToggleResponse,
  ListingBrowseParams,
  ListingCreateRequest,
  ListingResponse,
  PageResponse,
} from './marketplace-types';

const MARKETPLACE_ROOT = '/marketplace/v1';

function withQuery(path: string, params?: ListingBrowseParams) {
  const query = buildListingSearchParams(params);
  const serialized = query.toString();
  return serialized ? `${path}?${serialized}` : path;
}

export async function browseListings(params: ListingBrowseParams = {}) {
  return apiFetch<PageResponse<ListingResponse>>(
    withQuery(`${MARKETPLACE_ROOT}/listings`, params),
  );
}

export async function getListing(id: string) {
  return apiFetch<ListingResponse>(`${MARKETPLACE_ROOT}/listings/${id}`);
}

export async function getMyListings(params: ListingBrowseParams = {}) {
  return apiFetch<PageResponse<ListingResponse>>(
    withQuery(`${MARKETPLACE_ROOT}/listings/mine`, params),
  );
}

export async function createListing(request: ListingCreateRequest) {
  return apiFetch<ListingResponse>(`${MARKETPLACE_ROOT}/listings`, {
    method: 'POST',
    body: request,
  });
}

export async function toggleListingLike(id: string) {
  return apiFetch<LikeToggleResponse>(`${MARKETPLACE_ROOT}/listings/${id}/like`, {
    method: 'POST',
  });
}

export async function listCart() {
  return apiFetch<CartItemResponse[]>(`${MARKETPLACE_ROOT}/cart`);
}

export async function addToCart(listingId: string) {
  return apiFetch<CartItemResponse>(`${MARKETPLACE_ROOT}/cart/${listingId}`, {
    method: 'POST',
  });
}

export async function removeFromCart(listingId: string) {
  return apiFetch<void>(`${MARKETPLACE_ROOT}/cart/${listingId}`, {
    method: 'DELETE',
  });
}

export async function startChat(listingId: string) {
  return apiFetch<ChatResponse>(`${MARKETPLACE_ROOT}/chats`, {
    method: 'POST',
    body: { listingId },
  });
}
