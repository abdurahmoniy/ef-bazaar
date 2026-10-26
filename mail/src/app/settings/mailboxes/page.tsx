import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getMe } from '@/lib/auth';
import { mainSiteLoginUrl } from '@/lib/site';
import { getMyMailboxes, getMailboxSlots } from '@/lib/mail-server';
import { getMailboxManagementData } from '@/lib/mailbox-management-server';
import { MailShell } from '@/components/mail/mail-shell';
import { MailboxManagement } from '@/components/mail/mailbox-management';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Qutilarni boshqarish' };
export default async function MailboxManagementPage({ searchParams }: { searchParams?: Promise<{ mailbox?: string }> }) {
 const params = await searchParams ?? {};
 const localPath = '/settings/mailboxes' + (params.mailbox ? '?mailbox=' + encodeURIComponent(params.mailbox) : '');
 const user = await getMe();
 if (!user) redirect(mainSiteLoginUrl(localPath));
 const [mailboxes, slots, data] = await Promise.all([getMyMailboxes(), getMailboxSlots(), getMailboxManagementData()]);
 return <MailShell key={user.id} mailboxes={mailboxes} slots={slots} activeMailboxId={null}>
  <MailboxManagement boxes={data.boxes} accountEmails={data.accountEmails} slots={slots} wantedMailboxId={params.mailbox} />
 </MailShell>;
}
