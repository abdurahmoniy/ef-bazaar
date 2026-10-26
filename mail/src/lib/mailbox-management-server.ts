import 'server-only';
import { apiFetch } from './api';
import type { OwnedMailbox } from './mailbox-management';
async function read<T>(path: string): Promise<T | null> {
 try { return await apiFetch<T>(path); }
 catch { return null; }
}
export async function getMailboxManagementData(): Promise<{ boxes: OwnedMailbox[] | null; accountEmails: string[] | null }> {
 const [boxes, accounts] = await Promise.all([
  read<OwnedMailbox[]>('/trade/v1/mailboxes'),
  read<{ email: string | null; status?: string }[]>('/marketplace/v1/accounts'),
 ]);
 return {
  boxes,
  accountEmails: accounts === null ? null : accounts.filter(account => account.status !== 'ARCHIVED' && account.email).map(account => account.email!),
 };
}
