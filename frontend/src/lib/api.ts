/**
 * Backend (auth-service / marketplace-service) ga so'rovlar.
 *
 * Ishlash uslubi:
 * - SERVER (Node runtime, Server Components, Server Actions): `INTERNAL_API_BASE_URL`
 *   orqali ichki tarmoq'da nginx upstream'iga to'g'ridan-to'g'ri yuboriladi.
 *   Cookie'dagi access tokenni server o'qiydi va Authorization headerga qo'shadi.
 * - BROWSER: ishlatmang. Browser uchun Server Actions yoki API Route'lar yarating.
 *
 * Bunday qilingani uchun:
 * - access token httpOnly cookie'da qoladi — XSS xavfsiz.
 * - Backend URL'i tashqaridan ko'rinmaydi.
 */

import { cookies } from 'next/headers';

import type { ApiError } from './types';

const BASE = process.env.INTERNAL_API_BASE_URL || 'http://nginx/api';

const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

export class ApiException extends Error {
  status: number;
  code?: string;

  constructor(payload: ApiError) {
    super(payload.message);
    this.status = payload.status;
    this.code = payload.code;
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Defaults to true — adds Authorization header from access_token cookie */
  auth?: boolean;
}

/**
 * Server-side fetch with cookie-based auth.
 * Throws ApiException on non-2xx.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { body, auth = true, headers, ...rest } = options;

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string>),
  };

  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json';
  }

  if (auth) {
    const token = (await cookies()).get(ACCESS_COOKIE)?.value;
    if (token) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: requestHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });

  if (!res.ok) {
    let payload: ApiError;
    try {
      payload = await res.json();
    } catch {
      payload = {
        status: res.status,
        error: res.statusText,
        message: `Request failed with ${res.status}`,
      };
    }
    throw new ApiException(payload);
  }

  if (res.status === 204) return undefined as T;
  const ct = res.headers.get('content-type') || '';
  return (ct.includes('application/json') ? await res.json() : (await res.text())) as T;
}

export const ACCESS_COOKIE_NAME = ACCESS_COOKIE;
export const REFRESH_COOKIE_NAME = REFRESH_COOKIE;
