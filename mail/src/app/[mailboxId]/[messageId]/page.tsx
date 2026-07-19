import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { MarkReadBeacon } from '@/components/mail/mark-read-beacon';
import { MessageView, type MessageNav } from '@/components/mail/message-view';
import { getInbox, getMessage } from '@/lib/mail-server';

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

  // Session, shell and mailbox-ownership checks live in ../layout.tsx; the
  // backend re-verifies ownership on every call anyway (403 → null → 404).
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
    <>
      <MarkReadBeacon mailboxId={mailboxId} messageId={decodedId} seen={message.seen} />
      <MessageView mailboxId={mailboxId} message={message} nav={nav} />
    </>
  );
}
