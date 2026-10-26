import type { MailboxAccessFields } from './mailbox-access';
export interface MailboxResource extends MailboxAccessFields {
  id: string | null;
  email: string;
  ownerUserId: string | null;
  retainedUserId: string | null;
  kind: 'RANDOM' | 'CUSTOM' | 'SERVER_ONLY';
  slotExempt: boolean;
  activeTrade: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  usageObservedAt: string | null;
  usageStatus: 'FRESH' | 'STALE' | 'ERROR' | 'UNKNOWN';
  usageError: string | null;
  mailcowPresent: boolean | null;
  deleted: boolean;
  deletionStatus: 'NONE' | 'PENDING' | 'FAILED' | 'CONFIRMED';
  deletionError: string | null;
  provisioningStatus?: 'NONE' | 'STARTED' | 'CONFIRMED';
  provisioningClaimId?: string | null;
  provisioningError?: string | null;
  legalHold: boolean;
  holdReason: string | null;
}
export interface ReleaseProof {
  requestId: string;
  status: 'PENDING' | 'VERIFIED' | 'EXPIRED' | 'FAILED';
  startedAt?: string;
  expiresAt: string;
  error?: string | null;
}
export function resourceUsage(box: Pick<MailboxResource, 'usageBytes' | 'quotaBytes' | 'usageStatus'>) {
  const measured = typeof box.usageBytes === 'number' && Number.isFinite(box.usageBytes) && box.usageBytes >= 0 && typeof box.quotaBytes === 'number' && Number.isFinite(box.quotaBytes) && box.quotaBytes >= 0;
  const measurable = measured && box.quotaBytes! > 0;
  const percent = measurable ? Math.floor(box.usageBytes! / box.quotaBytes! * 100) : null;
  return { percent, warning: box.usageStatus === 'FRESH' && percent !== null && percent >= 80,
    label: box.usageStatus === 'ERROR' ? 'O‘lchashda xato' : box.usageStatus === 'STALE' ? 'O‘lchov eskirgan' : box.usageStatus === 'UNKNOWN' || !measured ? 'Hajm noma’lum' : 'Yangi o‘lchov' };
}
export function canReleaseMailbox(box: { activeTrade?: boolean; legalHold?: boolean; deletionStatus?: MailboxResource['deletionStatus']; provisioningStatus?: MailboxResource['provisioningStatus'] }, proof: ReleaseProof | null, now = new Date()): boolean {
  return box.activeTrade === false && box.legalHold === false && box.provisioningStatus !== 'STARTED' && box.deletionStatus !== 'PENDING' && box.deletionStatus !== 'CONFIRMED' && proof?.status === 'VERIFIED' && new Date(proof.expiresAt).getTime() > now.getTime();
}
async function request<T>(path: string, body?: object): Promise<T> {
  const response = await fetch(`/api/trade/v1/${path}`, { credentials: 'include', headers: { Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(payload?.message ?? 'Pochta so‘rovi bajarilmadi. Qayta urinib ko‘ring.');
  }
  return response.json();
}
export function fetchMailboxResources(admin = false): Promise<MailboxResource[]> { return request(`${admin ? 'admin/' : ''}mailboxes/resources`); }
export function startReleaseCheck(id: string): Promise<ReleaseProof> { return request(`mailboxes/${encodeURIComponent(id)}/release-check`, {}); }
export function getReleaseCheck(id: string, requestId: string): Promise<ReleaseProof> { return request(`mailboxes/${encodeURIComponent(id)}/release-check/${encodeURIComponent(requestId)}`); }
export function releaseMailbox(id: string, requestId: string): Promise<{ requestId: string; status: 'PENDING' | 'FAILED' | 'CONFIRMED'; lastError?: string | null }> { return request(`mailboxes/${encodeURIComponent(id)}/release`, { requestId, confirmDelete: true }); }
