import Link from 'next/link';
import { ArrowLeft, Paperclip } from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getAdminMailboxMessage } from '@/lib/mailbox-admin-server';
import { formatListingDate } from '@/lib/marketplace-format';

export const dynamic = 'force-dynamic';

interface AdminMessagePageProps {
  params: Promise<{ id: string; messageId: string }>;
}

/**
 * Read-only message view for admins. Opening a message here does NOT mark it
 * read — trade-service exposes no admin `markRead`, so an audit never changes
 * what the mailbox owner sees as unread.
 */
export default async function AdminMailboxMessagePage({ params }: AdminMessagePageProps) {
  const { id, messageId } = await params;
  const result = await getAdminMailboxMessage(id, messageId);

  if (!result.ok) {
    return <ApiErrorPanel title="Xat yuklanmadi" error={result.error} />;
  }
  const message = result.data;
  const attachmentBase = `/api/trade/v1/admin/mailboxes/${id}/messages/${messageId}/attachments`;

  return (
    <div className="space-y-4">
      <Link
        href={`/admin/mailboxes/${id}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Pochta
      </Link>

      <article className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card">
        <header className="space-y-1">
          <h1 className="text-lg font-black">{message.subject || '(mavzusiz)'}</h1>
          <p className="text-xs font-semibold text-muted-foreground">
            {message.fromName ? `${message.fromName} · ` : ''}
            {message.fromAddress} → {message.toAddresses.join(', ') || '—'}
          </p>
          <p className="text-xs font-semibold text-muted-foreground">
            {formatListingDate(message.receivedAt)}
          </p>
        </header>

        {message.attachments.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {message.attachments.map((attachment) => (
              <li key={attachment.attachmentId}>
                <a
                  href={`${attachmentBase}/${encodeURIComponent(attachment.attachmentId)}`}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold transition hover:border-primary/50"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {attachment.filename || 'fayl'}
                </a>
              </li>
            ))}
          </ul>
        )}

        {message.bodyHtml ? (
          <div
            className="mail-html-body text-sm"
            // Sanitised server-side by Jsoup in trade-service (script / iframe /
            // on* attributes stripped) — same guarantee the webmail relies on.
            dangerouslySetInnerHTML={{ __html: message.bodyHtml }}
          />
        ) : message.bodyPlain ? (
          <pre className="whitespace-pre-wrap break-words font-sans text-sm">
            {message.bodyPlain}
          </pre>
        ) : (
          <p className="text-sm text-muted-foreground">Xat matnini ko&apos;rsatib bo&apos;lmadi.</p>
        )}
      </article>
    </div>
  );
}
