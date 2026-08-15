import 'server-only';

import { apiFetch, ApiException } from './api';
import { buildListingSearchParams } from './marketplace-format';
import type {
  AdminReportResponse,
  AdminStatsResponse,
  AttributeDefinitionResponse,
  CardPage,
  AdminCardPage,
  CardType,
  ChatResponse,
  DreamTeam,
  MetaTier,
  ListingBrowseParams,
  ListingResponse,
  ListingStatus,
  MessageResponse,
  NotificationResponse,
  PageResponse,
  ReportStatus,
} from './marketplace-types';
import type { TrustComplaint, TrustComplaintStatus } from './gamer-types';
import type { User } from './types';

const MARKETPLACE_PREFIX = '/marketplace/v1';

/** Structured error surfaced up to the UI so it can render actual details. */
export interface FetchError {
  path: string;
  status: number;
  code?: string;
  message: string;
  details?: unknown;
  networkError?: boolean;
}

export type FetchResult<T> = { ok: true; data: T } | { ok: false; error: FetchError };

async function safeFetch<T>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<FetchResult<T>> {
  try {
    const data = await apiFetch<T>(path, options);
    return { ok: true, data };
  } catch (error) {
    if (error instanceof ApiException) {
      const detailStr = error.details ? ` details=${JSON.stringify(error.details)}` : '';
      console.error(
        `[marketplace-server] ${path} → ${error.status} ${error.code ?? ''}: ${error.message}${detailStr}`,
      );
      return {
        ok: false,
        error: {
          path,
          status: error.status,
          code: error.code,
          message: error.message,
          details: error.details,
        },
      };
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[marketplace-server] ${path} → network error:`, message);
    return {
      ok: false,
      error: {
        path,
        status: 0,
        code: 'network_error',
        message,
        networkError: true,
      },
    };
  }
}

/** Fall back to null when the endpoint returning 401/403/404 is expected. */
function nullifyExpected<T>(result: FetchResult<T>): T | null {
  if (result.ok) return result.data;
  if ([401, 403, 404].includes(result.error.status)) return null;
  return null;
}

export async function browseListings(
  filters: ListingBrowseParams,
): Promise<FetchResult<PageResponse<ListingResponse>>> {
  const query = buildListingSearchParams(filters).toString();
  const suffix = query ? `?${query}` : '';
  return safeFetch<PageResponse<ListingResponse>>(`${MARKETPLACE_PREFIX}/listings${suffix}`);
}

export async function getListing(
  id: string,
  matchCards?: string[],
  matchStrictness?: number,
): Promise<FetchResult<ListingResponse>> {
  const params = new URLSearchParams();
  for (const criterion of matchCards ?? []) params.append('matchCard', criterion);
  if (matchCards?.length) params.set('matchStrictness', String(matchStrictness ?? 4));
  const query = params.toString();
  return safeFetch<ListingResponse>(
    `${MARKETPLACE_PREFIX}/listings/${encodeURIComponent(id)}${query ? `?${query}` : ''}`,
  );
}

export async function getAttributeDefinitions(): Promise<AttributeDefinitionResponse[]> {
  const result = await safeFetch<AttributeDefinitionResponse[]>(`${MARKETPLACE_PREFIX}/attributes`);
  return result.ok ? result.data : [];
}

export async function getMyListings(): Promise<ListingResponse[]> {
  const result = await safeFetch<PageResponse<ListingResponse>>(
    `${MARKETPLACE_PREFIX}/listings/me?size=100&sort=createdAt,desc`,
  );
  return result.ok ? result.data.content : [];
}

export async function getMyChats(): Promise<ChatResponse[]> {
  const result = await safeFetch<ChatResponse[]>(`${MARKETPLACE_PREFIX}/chats/me`);
  return result.ok ? result.data : [];
}

export async function getChat(id: string): Promise<FetchResult<ChatResponse>> {
  return safeFetch<ChatResponse>(`${MARKETPLACE_PREFIX}/chats/${encodeURIComponent(id)}`);
}

export async function getChatMessages(
  id: string,
  page = 0,
  size = 100,
): Promise<PageResponse<MessageResponse> | null> {
  const result = await safeFetch<PageResponse<MessageResponse>>(
    `${MARKETPLACE_PREFIX}/chats/${encodeURIComponent(id)}/messages?page=${page}&size=${size}&sort=createdAt,asc`,
  );
  return result.ok ? result.data : null;
}

export async function getMyFavorites(): Promise<ListingResponse[]> {
  const result = await safeFetch<PageResponse<ListingResponse>>(
    `${MARKETPLACE_PREFIX}/listings/liked?size=100`,
  );
  return result.ok ? result.data.content : [];
}

/**
 * auth-service faqat /api/v1/users/me endpointini beradi (boshqa userni id
 * bo'yicha olish yo'q) — shuning uchun profil faqat so'ralgan userId joriy
 * foydalanuvchiga teng bo'lsa qaytadi, aks holda null.
 */
export async function getUserProfile(userId: string): Promise<User | null> {
  const result = await safeFetch<User>('/auth/v1/users/me');
  const me = nullifyExpected(result);
  return me && me.id === userId ? me : null;
}

// ---------- admin (backend rejects non-ROLE_ADMIN callers with 403) ----------

export async function getAdminStats(): Promise<FetchResult<AdminStatsResponse>> {
  return safeFetch<AdminStatsResponse>(`${MARKETPLACE_PREFIX}/admin/stats`);
}

export async function getAdminUsers(
  search?: string,
  page = 0,
  size = 20,
): Promise<FetchResult<PageResponse<User>>> {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort: 'createdAt,desc' });
  if (search) params.set('search', search);
  return safeFetch<PageResponse<User>>(`/auth/v1/admin/users?${params.toString()}`);
}

/** The caller's saved squads. Returns [] rather than an error when signed out. */
export async function getDreamTeams(): Promise<FetchResult<DreamTeam[]>> {
  return safeFetch<DreamTeam[]>(`${MARKETPLACE_PREFIX}/dream-teams`);
}

/**
 * Player card catalogue for the admin players page. The read endpoint itself
 * is public (same one the card picker uses) — only the meta_tier write is
 * admin-gated.
 */
export async function getCards(params: {
  q?: string;
  types?: CardType[];
  tier?: MetaTier;
  page?: number;
  size?: number;
}): Promise<FetchResult<CardPage>> {
  const search = new URLSearchParams({
    page: String(params.page ?? 0),
    size: String(params.size ?? 30),
  });
  if (params.q) search.set('q', params.q);
  if (params.types?.length) search.set('types', params.types.join(','));
  if (params.tier) search.set('tier', params.tier);
  return safeFetch<CardPage>(`${MARKETPLACE_PREFIX}/cards?${search.toString()}`);
}

export async function getAdminCards(params: {
  q?: string;
  types?: CardType[];
  tier?: MetaTier;
  page?: number;
  size?: number;
}): Promise<FetchResult<AdminCardPage>> {
  const search = new URLSearchParams({
    page: String(params.page ?? 0),
    size: String(params.size ?? 30),
  });
  if (params.q) search.set('q', params.q);
  if (params.types?.length) search.set('types', params.types.join(','));
  if (params.tier) search.set('tier', params.tier);
  return safeFetch<AdminCardPage>(
    `${MARKETPLACE_PREFIX}/admin/cards?${search.toString()}`,
  );
}

/** All definitions including inactive — the admin table shows the `active` flag. */
export async function getAdminAttributeDefinitions(): Promise<
  FetchResult<AttributeDefinitionResponse[]>
> {
  return safeFetch<AttributeDefinitionResponse[]>(
    `${MARKETPLACE_PREFIX}/attributes?includeInactive=true`,
  );
}

export async function getAdminReports(
  status?: ReportStatus,
  page = 0,
  size = 20,
): Promise<FetchResult<PageResponse<AdminReportResponse>>> {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort: 'createdAt,desc' });
  if (status) params.set('status', status);
  return safeFetch<PageResponse<AdminReportResponse>>(
    `${MARKETPLACE_PREFIX}/admin/reports?${params.toString()}`,
  );
}

export async function getAdminListings(
  status?: ListingStatus,
  page = 0,
  size = 20,
): Promise<FetchResult<PageResponse<ListingResponse>>> {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort: 'createdAt,desc' });
  if (status) params.set('status', status);
  return safeFetch<PageResponse<ListingResponse>>(
    `${MARKETPLACE_PREFIX}/admin/listings?${params.toString()}`,
  );
}

export async function getAdminTrustComplaints(
  status?: TrustComplaintStatus,
  page = 0,
  size = 20,
): Promise<FetchResult<PageResponse<TrustComplaint>>> {
  // Backend o'zi createdAt DESC bilan tartiblaydi (findByStatusOrderByCreatedAtDesc).
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (status) params.set('status', status);
  return safeFetch<PageResponse<TrustComplaint>>(
    `${MARKETPLACE_PREFIX}/admin/trust/complaints?${params.toString()}`,
  );
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
  const result = await browseListings(filters);
  if (!result.ok) return [];
  return result.data.content.filter((entry) => entry.id !== listing.id).slice(0, limit);
}

export async function getMyNotifications(size = 50): Promise<NotificationResponse[]> {
  const result = await safeFetch<PageResponse<NotificationResponse>>(
    `${MARKETPLACE_PREFIX}/notifications?size=${size}`,
  );
  if (!result.ok) return [];
  return result.data.content ?? [];
}

