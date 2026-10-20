'use client';

import type { Availability, CustomMailbox } from './custom-mailbox';
import type { LinkSession } from './link-session';

/** A refusal from trade-service, with the code the screen branches on. */
export class MailboxApiError extends Error {
  constructor(public readonly status: number, public readonly code: string | null, message: string) {
    super(message);
  }
}

const BASE = '/api/trade/v1/mailboxes';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { code?: string; message?: string };
    throw new MailboxApiError(res.status, body.code ?? null, body.message ?? 'So‘rov bajarilmadi');
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export function checkAvailability(localPart: string, domain: string, signal?: AbortSignal): Promise<Availability> {
  const q = new URLSearchParams({ localPart, domain });
  return call<Availability>(`/custom/availability?${q}`, { signal });
}

export function claimCustomMailbox(localPart: string, domain: string, signal?: AbortSignal): Promise<CustomMailbox> {
  return call<CustomMailbox>('/custom', { method: 'POST', body: JSON.stringify({ localPart, domain }), signal });
}

export function listCustomMailboxes(): Promise<CustomMailbox[]> {
  return call<CustomMailbox[]>('/custom');
}

export type OwnedMailbox = { id: string; email: string; kind: 'RANDOM' | 'CUSTOM'; linkedAccountId: string | null; locked: boolean };

export function listOwnedMailboxes(): Promise<OwnedMailbox[]> {
  return call<OwnedMailbox[]>('');
}

export function openSession(mailboxId: string, accountId: string, emailAlreadySet: boolean): Promise<LinkSession> {
  return call<LinkSession>(`/${mailboxId}/link-sessions`, {
    method: 'POST',
    body: JSON.stringify({ accountId, emailAlreadySet }),
  });
}

export function getSession(sessionId: string): Promise<LinkSession> {
  return call<LinkSession>(`/link-sessions/${sessionId}`);
}

export function markEmailChanged(sessionId: string): Promise<LinkSession> {
  return call<LinkSession>(`/link-sessions/${sessionId}/email-changed`, { method: 'POST' });
}

export function retrySession(sessionId: string): Promise<LinkSession> {
  return call<LinkSession>(`/link-sessions/${sessionId}/retry`, { method: 'POST' });
}

export function cancelSession(sessionId: string): Promise<void> {
  return call<void>(`/link-sessions/${sessionId}`, { method: 'DELETE' });
}

export function republishSession(sessionId: string): Promise<void> {
  return call<void>(`/link-sessions/${sessionId}/republish`, { method: 'POST' });
}
