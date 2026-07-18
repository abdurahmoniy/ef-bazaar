import Link from 'next/link';
import { ArrowLeft, Download, Paperclip } from 'lucide-react';

import { attachmentDownloadUrl } from '@/lib/mail-server';
import { formatBytes, relativeUz } from '@/lib/mail-format';
import type { MessageDetail } from '@/lib/mail-types';

interface MessageViewProps {
  mailboxId: string;
  message: MessageDetail;
}

/**
 * Full message reader. HTML body is already sanitised server-side by Jsoup
 * (script / iframe / img / style stripped) — we render it with
 * `dangerouslySetInnerHTML` because we've already proved it's safe on the
 * trade-service side and shipping a client-side sanitiser (DOMPurify) would
 * add ~50kb for a guarantee we already have.
 *
 * Body preference: HTML if present, otherwise plain (whitespace-preserved).
 * If both are missing (rare — extract failure) the reader shows a friendly
 * note instead of empty space.
 */
export function MessageView({ mailboxId, message }: MessageViewProps) {
  const hasHtml = message.bodyHtml && message.bodyHtml.trim().length > 0;
  const hasPlain = message.bodyPlain && message.bodyPlain.trim().length > 0;
  const displayFrom = message.fromName || message.fromAddress || 'Noma\'lum';

  return (
    <article className="space-y-4 rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link
          href={`/${mailboxId}`}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 hover:bg-muted"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Inbox</span>
        </Link>
      </div>

      <header className="space-y-2 border-b border-border pb-4">
        <h1 className="text-lg font-black text-foreground sm:text-xl">
          {message.subject || '(mavzu yo\'q)'}
        </h1>
        <dl className="grid gap-1 text-xs sm:grid-cols-[6rem_1fr]">
          <dt className="font-semibold text-muted-foreground">Kimdan:</dt>
          <dd className="text-foreground">
            <span className="font-semibold">{displayFrom}</span>
            {message.fromAddress && message.fromName && (
              <span className="ml-1 text-muted-foreground">&lt;{message.fromAddress}&gt;</span>
            )}
          </dd>
          {message.toAddresses.length > 0 && (
            <>
              <dt className="font-semibold text-muted-foreground">Kimga:</dt>
              <dd className="text-foreground">{message.toAddresses.join(', ')}</dd>
            </>
          )}
          {message.ccAddresses.length > 0 && (
            <>
              <dt className="font-semibold text-muted-foreground">Nusxa:</dt>
              <dd className="text-foreground">{message.ccAddresses.join(', ')}</dd>
            </>
          )}
          <dt className="font-semibold text-muted-foreground">Vaqt:</dt>
          <dd className="text-foreground">{relativeUz(message.receivedAt)}</dd>
        </dl>
      </header>

      {hasHtml ? (
        <div
          className="mail-html-body"
          // Sanitised server-side by Jsoup — see MessageView docstring.
          dangerouslySetInnerHTML={{ __html: message.bodyHtml ?? '' }}
        />
      ) : hasPlain ? (
        <pre className="whitespace-pre-wrap break-words font-sans text-sm text-foreground">
          {message.bodyPlain}
        </pre>
      ) : (
        <p className="text-sm text-muted-foreground">
          Xat matnini ko&apos;rsatib bo&apos;lmadi.
        </p>
      )}

      {message.attachments.length > 0 && (
        <section className="border-t border-border pt-4">
          <h2 className="mb-2 flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" />
            Ilovalar ({message.attachments.length})
          </h2>
          <ul className="flex flex-wrap gap-2">
            {message.attachments.map((att) => (
              <li key={att.attachmentId}>
                <a
                  href={attachmentDownloadUrl(mailboxId, message.messageId, att.attachmentId)}
                  className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs hover:bg-muted"
                  // Backend always returns Content-Disposition: attachment,
                  // so this triggers a download rather than in-app preview.
                  download
                >
                  <Download className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="max-w-[16rem] truncate font-semibold text-foreground">
                    {att.filename || 'ilova'}
                  </span>
                  <span className="text-muted-foreground">{formatBytes(att.sizeBytes)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}
