'use client';

import { buildMarketplaceApiPath } from './marketplace-client-api';
import { marketplaceRequest, type ActionResult } from './marketplace-actions';
import type { AccountPayload, PublishAccountPayload, UserAccountResponse } from './accounts-types';
import type { ListingResponse } from './marketplace-types';

export function getMyAccounts(): Promise<ActionResult<UserAccountResponse[]>> {
  return marketplaceRequest<UserAccountResponse[]>(
    ['v1', 'accounts'],
    { method: 'GET' },
    'Akkountlar yuklanmadi',
  );
}

export function createAccount(payload: AccountPayload): Promise<ActionResult<UserAccountResponse>> {
  return marketplaceRequest<UserAccountResponse>(
    ['v1', 'accounts'],
    { method: 'POST', body: JSON.stringify(payload) },
    'Akkount saqlanmadi',
  );
}

export function updateAccount(
  id: string,
  payload: AccountPayload,
): Promise<ActionResult<UserAccountResponse>> {
  return marketplaceRequest<UserAccountResponse>(
    ['v1', 'accounts', id],
    { method: 'PATCH', body: JSON.stringify(payload) },
    'Akkount yangilanmadi',
  );
}

/** Bo'sh qiymat manzilni uzadi — backend `null` ni shunday o'qiydi. */
export function setAccountEmail(
  id: string,
  email: string | null,
): Promise<ActionResult<UserAccountResponse>> {
  const trimmed = email?.trim();
  return marketplaceRequest<UserAccountResponse>(
    ['v1', 'accounts', id, 'email'],
    { method: 'PATCH', body: JSON.stringify({ email: trimmed ? trimmed : null }) },
    'Email saqlanmadi',
  );
}

export function deleteAccount(id: string): Promise<ActionResult<null>> {
  return marketplaceRequest<null>(
    ['v1', 'accounts', id],
    { method: 'DELETE' },
    "Akkount o'chirilmadi",
  );
}

export function publishAccount(
  id: string,
  payload: PublishAccountPayload,
): Promise<ActionResult<ListingResponse>> {
  return marketplaceRequest<ListingResponse>(
    ['v1', 'accounts', id, 'publish'],
    { method: 'POST', body: JSON.stringify(payload) },
    "Bozorga chiqarib bo'lmadi",
  );
}

export function unpublishAccount(id: string): Promise<ActionResult<UserAccountResponse>> {
  return marketplaceRequest<UserAccountResponse>(
    ['v1', 'accounts', id, 'unpublish'],
    { method: 'POST' },
    "Bozordan olib bo'lmadi",
  );
}

/**
 * Rasmlarni almashtirish — multipart.
 *
 * <p>`marketplaceRequest` ishlatilmaydi: u JSON sarlavhasini qo'yadi va
 * FormData chegarasini (boundary) buzib yuborardi.
 */
export async function replaceAccountMedia(
  id: string,
  files: File[],
): Promise<ActionResult<UserAccountResponse>> {
  const body = new FormData();
  for (const file of files) body.append('files', file);

  try {
    const response = await fetch(buildMarketplaceApiPath(['v1', 'accounts', id, 'media']), {
      method: 'POST',
      headers: { Accept: 'application/json' },
      credentials: 'include',
      body,
    });
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const record = typeof payload === 'object' && payload !== null
        ? (payload as Record<string, unknown>)
        : {};
      return {
        ok: false,
        status: response.status,
        message: typeof record.message === 'string' ? record.message : 'Rasmlar yuklanmadi',
        code: typeof record.code === 'string' ? record.code : undefined,
      };
    }
    return { ok: true, data: payload as UserAccountResponse };
  } catch {
    return { ok: false, status: 0, message: "Tarmoq xatoligi. Qayta urinib ko'ring." };
  }
}
