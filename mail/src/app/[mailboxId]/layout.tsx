import { notFound, redirect } from 'next/navigation';

import { MailShell } from '@/components/mail/mail-shell';
import { getMe } from '@/lib/auth';
import { getMyMailboxes } from '@/lib/mail-server';
import { mainSiteLoginUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

interface MailboxLayoutProps {
  params: Promise<{ mailboxId: string }>;
  children: React.ReactNode;
}

/**
 * Segment layout for everything under /[mailboxId]. Owns the session check
 * and the shell (header + sidebar), so navigating inbox ↔ message only swaps
 * the reading pane — the chrome stays mounted and there is no full-page
 * skeleton flash. Pages below re-use getMyMailboxes() via React cache, so
 * the mailbox list is still fetched once per request.
 */
export default async function MailboxLayout({ params, children }: MailboxLayoutProps) {
  const { mailboxId } = await params;

  const user = await getMe();
  if (!user) redirect(mainSiteLoginUrl(`/${mailboxId}`));

  const mailboxes = await getMyMailboxes();
  if (!mailboxes.some((m) => m.id === mailboxId)) notFound();

  return (
    <MailShell mailboxes={mailboxes} activeMailboxId={mailboxId}>
      {children}
    </MailShell>
  );
}
