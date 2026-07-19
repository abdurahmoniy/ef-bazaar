import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { MailShell } from '@/components/mail/mail-shell';
import { MessageView, type MessageNav } from '@/components/mail/message-view';
import { getMe } from '@/lib/auth';
import { getInbox, getMessage, getMyMailboxes } from '@/lib/mail-server';
import { mainSiteLoginUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pochta',
};

/** How deep into the inbox we look for prev/next neighbours. */
const NEIGHBOR_SCAN = 100;

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

  const [message, inbox] = await Promise.all([
    getMessage(mailboxId, messageId),
    // Best-effort neighbour lookup for prev/next navigation — a null inbox
    // (IMAP hiccup) just means the arrows don't render.
    getInbox(mailboxId, { limit: NEIGHBOR_SCAN, offset: 0 }),
  ]);
  if (!message) notFound();

  let nav: MessageNav | undefined;
  const decodedId = decodeURIComponent(messageId);
  const idx = inbox?.messages.findIndex((m) => m.messageId === decodedId) ?? -1;
  if (inbox && idx >= 0) {
    const prev = idx > 0 ? inbox.messages[idx - 1] : null;
    const next = idx + 1 < inbox.messages.length ? inbox.messages[idx + 1] : null;
    nav = {
      prevHref: prev ? `/${mailboxId}/${encodeURIComponent(prev.messageId)}` : null,
      nextHref: next ? `/${mailboxId}/${encodeURIComponent(next.messageId)}` : null,
      position: idx + 1,
      total: inbox.total,
    };
  }

  return (
    <MailShell mailboxes={mailboxes} activeMailboxId={mailboxId}>
      <MessageView mailboxId={mailboxId} message={message} nav={nav} />
    </MailShell>
  );
}
