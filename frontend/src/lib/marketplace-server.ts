import 'server-only';

import { apiFetch, ApiException } from './api';
import { buildListingSearchParams } from './marketplace-format';
import type {
  AttributeDefinitionResponse,
  ChatResponse,
  ListingBrowseParams,
  ListingResponse,
  PageResponse,
} from './marketplace-types';
import type { User } from './types';

const MARKETPLACE_PREFIX = '/marketplace/v1';

async function safeFetch<T>(path: string, options?: Parameters<typeof apiFetch>[1]): Promise<T | null> {
  try {
    return await apiFetch<T>(path, options);
  } catch (error) {
    if (error instanceof ApiException) {
      // 401/403/404 are expected (anon browsing an owner-only endpoint, missing entity).
      if ([401, 403, 404].includes(error.status)) return null;
      const detailStr = error.details ? ` details=${JSON.stringify(error.details)}` : '';
      console.error(
        `[marketplace-server] ${path} → ${error.status} ${error.code ?? ''}: ${error.message}${detailStr}`,
      );
      return null;
    }
    console.error(`[marketplace-server] ${path} → network error:`, error);
    return null;
  }
}

export async function browseListings(
  filters: ListingBrowseParams,
): Promise<PageResponse<ListingResponse> | null> {
  const query = buildListingSearchParams(filters).toString();
  const suffix = query ? `?${query}` : '';
  return safeFetch<PageResponse<ListingResponse>>(`${MARKETPLACE_PREFIX}/listings${suffix}`);
}

export async function getListing(id: string): Promise<ListingResponse | null> {
  return safeFetch<ListingResponse>(`${MARKETPLACE_PREFIX}/listings/${encodeURIComponent(id)}`);
}

export async function getAttributeDefinitions(): Promise<AttributeDefinitionResponse[]> {
  const definitions = await safeFetch<AttributeDefinitionResponse[]>(
    `${MARKETPLACE_PREFIX}/attributes`,
  );
  return definitions ?? [];
}

export async function getMyListings(): Promise<ListingResponse[]> {
  const page = await safeFetch<PageResponse<ListingResponse>>(
    `${MARKETPLACE_PREFIX}/listings/me?size=100&sort=createdAt,desc`,
  );
  return page?.content ?? [];
}

export async function getMyChats(): Promise<ChatResponse[]> {
  const chats = await safeFetch<ChatResponse[]>(`${MARKETPLACE_PREFIX}/chats/me`);
  return chats ?? [];
}

export async function getMyFavorites(): Promise<ListingResponse[]> {
  const page = await safeFetch<PageResponse<ListingResponse>>(
    `${MARKETPLACE_PREFIX}/listings/liked?size=100`,
  );
  return page?.content ?? [];
}

export async function getUserProfile(userId: string): Promise<User | null> {
  return safeFetch<User>(`/auth/v1/users/${encodeURIComponent(userId)}`);
}

export async function getSimilarListings(
  listing: ListingResponse,
  limit = 4,
): Promise<ListingResponse[]> {
  const filters: ListingBrowseParams = { size: limit + 1, sort: 'createdAt,desc' };
  const division = listing.attributes?.highest_division_level;
  if (typeof division === 'number' || typeof division === 'string') {
    filters.attributes = { highest_division_level: String(division) };
  }
  const page = await browseListings(filters);
  return (page?.content ?? []).filter((entry) => entry.id !== listing.id).slice(0, limit);
}
