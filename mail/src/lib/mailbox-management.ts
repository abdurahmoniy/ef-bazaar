import { mailboxAccess, type MailboxAccessFields } from './mailbox-access';
export interface OwnedMailbox extends MailboxAccessFields {
 id: string; email: string; tradeId: string | null;
 kind?: 'RANDOM' | 'CUSTOM'; slotExempt?: boolean; activeTrade?: boolean;
 linkedAccountId?: string | null; activeSessionId?: string | null; provisionedAt?: string | null;
}
/** Missing account data is unknown, never proof that a recovery mailbox is unused. */
export function availableMailboxes(boxes: OwnedMailbox[], accountEmails: string[] | null): OwnedMailbox[] | null {
 if (accountEmails === null) return null;
 const used = new Set(accountEmails.map(email => email.trim().toLowerCase()));
 return boxes.filter(box => !['LOCKED', 'RECOVERY'].includes(mailboxAccess(box)) && !box.activeTrade && !box.tradeId && !box.linkedAccountId
  && !box.activeSessionId && !!box.provisionedAt && !used.has(box.email.trim().toLowerCase()))
  .sort((a, b) => Number(a.kind !== 'CUSTOM') - Number(b.kind !== 'CUSTOM'));
}
export async function unlockMailbox(id: string, lockInsteadId: string, signal?: AbortSignal): Promise<void> {
 const response = await fetch('/api/trade/v1/mailboxes/' + encodeURIComponent(id) + '/unlock', {
  method: 'POST', credentials: 'include', signal,
  headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify({ lockInsteadId }),
 });
 if (!response.ok) {
  const payload = await response.json().catch(() => null);
  throw new Error(payload?.message ?? 'Qutini ochib bo‘lmadi. Qayta urinib ko‘ring.');
 }
}
