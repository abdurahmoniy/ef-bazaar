import { watchErrorMessage, type WatchKind } from './watches';

export class WatchRequestError extends Error {
  constructor(readonly status: number, readonly code: string | undefined, message: string) {
    super(message);
  }
}

export async function watchRequest<T>(kind: WatchKind, suffix = '', method = 'GET', body?: unknown): Promise<T> {
  const base = kind === 'search' ? '/api/rec/v1/saved-searches' : '/api/marketplace/v1/price-watches';
  let response: Response;
  try {
    response = await fetch(`${base}${suffix}`, {
      method, credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('Tarmoq xatoligi. Qayta urinib ko‘ring.');
  }
  const payload: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  if (!response.ok) {
    const code = payload && typeof payload === 'object' && 'code' in payload && typeof payload.code === 'string' ? payload.code : undefined;
    throw new WatchRequestError(response.status, code, watchErrorMessage(response.status, payload));
  }
  return payload as T;
}
