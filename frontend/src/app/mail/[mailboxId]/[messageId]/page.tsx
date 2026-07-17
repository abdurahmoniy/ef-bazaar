import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { MailShell } from '@/components/mail/mail-shell';
import { MessageView } from '@/components/mail/message-view';
import { getMe } from '@/lib/auth';
import { getMessage, getMyMailboxes } from '@/lib/mail-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pochta',
  robots: { index: false, follow: false },
};

interface MessagePageProps {
  params: Promise<{ mailboxId: string; messageId: string }>;
}

export default async function MessagePage({ params }: MessagePageProps) {
  const { mailboxId, messageId } = await params;

  const user = await getMe();
  if (!user) redirect(`/auth/login?from=/mail/${mailboxId}/${messageId}`);

  const mailboxes = await getMyMailboxes();
  const active = mailboxes.find((m) => m.id === mailboxId);
  if (!active) notFound();

  const message = await getMessage(mailboxId, messageId);
  if (!message) notFound();

  return (
    <MailShell user={user} mailboxes={mailboxes} activeMailboxId={mailboxId}>
      <MessageView mailboxId={mailboxId} message={message} />
    </MailShell>
  );
}
