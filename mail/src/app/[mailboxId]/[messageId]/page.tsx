import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { MailShell } from '@/components/mail/mail-shell';
import { MessageView } from '@/components/mail/message-view';
import { getMe } from '@/lib/auth';
import { getMessage, getMyMailboxes } from '@/lib/mail-server';
import { mainSiteLoginUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pochta',
};

interface MessagePageProps {
  params: Promise<{ mailboxId: string; messageId: string }>;
}

export default async function MessagePage({ params }: MessagePageProps) {
  const { mailboxId, messageId } = await params;

  const user = await getMe();
  if (!user) redirect(mainSiteLoginUrl(`/${mailboxId}/${messageId}`));

  const mailboxes = await getMyMailboxes();
  const active = mailboxes.find((m) => m.id === mailboxId);
  if (!active) notFound();

  const message = await getMessage(mailboxId, messageId);
  if (!message) notFound();

  return (
    <MailShell mailboxes={mailboxes} activeMailboxId={mailboxId}>
      <MessageView mailboxId={mailboxId} message={message} />
    </MailShell>
  );
}
