'use client';

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
