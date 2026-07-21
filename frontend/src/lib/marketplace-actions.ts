'use client';

import { buildMarketplaceApiPath } from './marketplace-client-api';
import type {
  AttributeDefinitionCreatePayload,
  AttributeDefinitionResponse,
  AttributeDefinitionUpdatePayload,
  LikeToggleResponse,
} from './marketplace-types';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; code?: string };

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

function messageFrom(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return fallback;
}

function codeFrom(payload: unknown): string | undefined {
  if (!isRecord(payload)) return undefined;
  return typeof payload.code === 'string' ? payload.code : undefined;
}

async function marketplaceRequest<T>(
  path: string[],
  init: RequestInit,
  fallbackMessage: string,
): Promise<ActionResult<T>> {
  const response = await fetch(buildMarketplaceApiPath(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    credentials: 'include',
  });
  const payload = await readJson(response);
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message:
        response.status === 401 || response.status === 403
          ? 'Kirish talab qilinadi'
          : messageFrom(payload, fallbackMessage),
      code: codeFrom(payload),
    };
  }
  return { ok: true, data: payload as T };
}

export function toggleListingLike(
  listingId: string,
): Promise<ActionResult<LikeToggleResponse>> {
  return marketplaceRequest<LikeToggleResponse>(
    ['v1', 'listings', listingId, 'like'],
    { method: 'POST' },
    'Like saqlanmadi',
  );
}

// ---------- admin (backend rejects non-ROLE_ADMIN callers with 403) ----------

export function adminResolveReport(reportId: string): Promise<ActionResult<null>> {
  return marketplaceRequest<null>(
    ['v1', 'admin', 'reports', reportId, 'resolve'],
    { method: 'POST' },
    'Shikoyat yangilanmadi',
  );
}

export function adminDismissReport(reportId: string): Promise<ActionResult<null>> {
  return marketplaceRequest<null>(
    ['v1', 'admin', 'reports', reportId, 'dismiss'],
    { method: 'POST' },
    'Shikoyat yangilanmadi',
  );
}

// ---------- admin trust (shikoyat → penalty engine) ----------

export function adminConfirmTrustComplaint(complaintId: string): Promise<ActionResult<unknown>> {
  return marketplaceRequest<unknown>(
    ['v1', 'admin', 'trust', 'complaints', complaintId, 'confirm'],
    { method: 'POST' },
    'Shikoyat tasdiqlanmadi',
  );
}

export function adminRejectTrustComplaint(complaintId: string): Promise<ActionResult<unknown>> {
  return marketplaceRequest<unknown>(
    ['v1', 'admin', 'trust', 'complaints', complaintId, 'reject'],
    { method: 'POST' },
    'Shikoyat rad etilmadi',
  );
}

/**
 * Owner-side soft-delete: flips the listing to DELETED status via
 * DELETE /api/v1/listings/{id}. Backend rejects with 403 if the caller isn't
 * the seller. Row stays in the DB for audit; the browse filter (ACTIVE + SOLD)
 * hides it. Undo requires an admin restore.
 */
export function deleteListing(listingId: string): Promise<ActionResult<null>> {
  return marketplaceRequest<null>(
    ['v1', 'listings', listingId],
    { method: 'DELETE' },
    "E'lon o'chirilmadi",
  );
}

export function adminDeleteListing(listingId: string): Promise<ActionResult<null>> {
  return marketplaceRequest<null>(
    ['v1', 'admin', 'listings', listingId],
    { method: 'DELETE' },
    "E'lon o'chirilmadi",
  );
}

export function adminRestoreListing(listingId: string): Promise<ActionResult<unknown>> {
  return marketplaceRequest<unknown>(
    ['v1', 'admin', 'listings', listingId, 'restore'],
    { method: 'POST' },
    "E'lon tiklanmadi",
  );
}

export function adminCreateAttribute(
  payload: AttributeDefinitionCreatePayload,
): Promise<ActionResult<AttributeDefinitionResponse>> {
  return marketplaceRequest<AttributeDefinitionResponse>(
    ['v1', 'admin', 'attributes'],
    { method: 'POST', body: JSON.stringify(payload) },
    'Atribut yaratilmadi',
  );
}

export function adminUpdateAttribute(
  id: string,
  payload: AttributeDefinitionUpdatePayload,
): Promise<ActionResult<AttributeDefinitionResponse>> {
  return marketplaceRequest<AttributeDefinitionResponse>(
    ['v1', 'admin', 'attributes', id],
    { method: 'PUT', body: JSON.stringify(payload) },
    'Atribut yangilanmadi',
  );
}

/** Soft delete — backend flips {@code active=false}; the definition stays listed as inactive. */
export function adminDeleteAttribute(id: string): Promise<ActionResult<null>> {
  return marketplaceRequest<null>(
    ['v1', 'admin', 'attributes', id],
    { method: 'DELETE' },
    "Atribut o'chirilmadi",
  );
}
