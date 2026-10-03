'use client';

import type { LoginStepResponse, UserbotAccount, UserbotErrorBody, UserbotFeature } from './userbot-types';

/**
 * Browser-side calls to userbot-core through the same-origin proxy
 * (`/api/userbot/[...path]`), which attaches the httpOnly access cookie.
 * The service itself checks ROLE_ADMIN. Login codes and passwords travel only
 * in request bodies — never into an Error, a log or the URL.
 */
const BASE = '/api/userbot/v1';

export class UserbotApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSec?: number;

  constructor(status: number, body: Partial<UserbotErrorBody>) {
    super(status === 401 ? 'Sessiya tugadi — sahifani yangilang.' : body.message || `So'rov bajarilmadi (${status})`);
    this.name = 'UserbotApiError';
    this.status = status;
    this.code = status === 401 ? 'UNAUTHENTICATED' : body.code || `HTTP_${status}`;
    this.retryAfterSec = body.retryAfterSec;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<UserbotErrorBody>;
    throw new UserbotApiError(res.status, body);
  }
  return (await res.json()) as T;
}

const id = (v: string) => encodeURIComponent(v);
const post = (body?: unknown): RequestInit => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const listAccounts = () => call<UserbotAccount[]>('/accounts');
export const listFeatures = () => call<UserbotFeature[]>('/features');
export const startLogin = (phone: string) => call<LoginStepResponse>('/logins', post({ phone }));
export const submitCode = (loginId: string, code: string) =>
  call<LoginStepResponse>(`/logins/${id(loginId)}/code`, post({ code }));
export const submitPassword = (loginId: string, password: string) =>
  call<LoginStepResponse>(`/logins/${id(loginId)}/password`, post({ password }));
export const resendCode = (loginId: string) => call<LoginStepResponse>(`/logins/${id(loginId)}/resend`, post());
export const cancelLogin = (loginId: string) => call<void>(`/logins/${id(loginId)}`, { method: 'DELETE' });
export const disconnectAccount = (accountId: string) =>
  call<void>(`/accounts/${id(accountId)}`, { method: 'DELETE' });
export const bindFeature = (feature: string, accountId: string) =>
  call<UserbotFeature>(`/features/${id(feature)}`, { method: 'PUT', body: JSON.stringify({ accountId }) });
export const avatarUrl = (accountId: string) => `${BASE}/accounts/${id(accountId)}/avatar`;
