import 'server-only';

import { apiFetch, ApiException } from './api';
import type { FetchError, FetchResult } from './marketplace-server';
import type { PageResponse } from './marketplace-types';
import type {
  TradeAdminApplicationResponse,
  TradeAdminApplicationStatus,
} from './trade-admin-applications';

const AUTH_PREFIX = '/auth/v1';

function toFetchError(path: string, error: unknown): FetchError {
  if (error instanceof ApiException) {
    return {
      path,
      status: error.status,
      code: error.code,
      message: error.message,
      details: error.details,
    };
  }
  const message = error instanceof Error ? error.message : String(error);
  return {
    path,
    status: 0,
    code: 'network_error',
    message,
    networkError: true,
  };
}

async function safeFetch<T>(
  path: string,
  options?: Parameters<typeof apiFetch>[1],
): Promise<FetchResult<T>> {
  try {
    return { ok: true, data: await apiFetch<T>(path, options) };
  } catch (error) {
    console.error(`[auth-server] ${path} →`, error);
    return { ok: false, error: toFetchError(path, error) };
  }
}

export async function getMyTradeAdminApplication(): Promise<TradeAdminApplicationResponse | null> {
  try {
    const response = await apiFetch<TradeAdminApplicationResponse | undefined>(
      `${AUTH_PREFIX}/trade-admin-applications/me`,
    );
    return response ?? null;
  } catch (error) {
    if (error instanceof ApiException && [401, 403, 404].includes(error.status)) return null;
    console.error('[auth-server] /trade-admin-applications/me →', error);
    return null;
  }
}

export async function getAdminTradeAdminApplications(
  status: TradeAdminApplicationStatus | undefined,
  page = 0,
  size = 20,
): Promise<FetchResult<PageResponse<TradeAdminApplicationResponse>>> {
  const params = new URLSearchParams({
    page: String(page),
    size: String(size),
    sort: 'createdAt,desc',
  });
  if (status) params.set('status', status);
  return safeFetch<PageResponse<TradeAdminApplicationResponse>>(
    `${AUTH_PREFIX}/admin/trade-admin-applications?${params.toString()}`,
  );
}
