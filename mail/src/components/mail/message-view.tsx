import Link from 'next/link';
import parseHtml from 'html-react-parser';
import Linkify from 'linkify-react';
import type { Opts } from 'linkifyjs';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Download,
  File,
  FileArchive,
  FileImage,
  FileText,
  KeyRound,
  Paperclip,
} from 'lucide-react';

import { CopyButton } from '@/components/mail/copy-button';
import { MessageHotkeys } from '@/components/mail/message-hotkeys';
import { attachmentDownloadUrl } from '@/lib/mail-server';
import {
  extractOtpCode,
  formatBytes,
  fullDateUz,
  mailAvatarColor,
  mailAvatarInitial,
  relativeUz,
} from '@/lib/mail-format';
import { cn } from '@/lib/utils';
import type { MessageDetail } from '@/lib/mail-types';

// Only HTTP(S) and email links may be created from message text. Existing
// HTML links already have safe protocols/targets enforced by the backend.
const BODY_LINK_OPTIONS: Opts = {
  defaultProtocol: 'https',
  target: '_blank',
  rel: 'noopener noreferrer',
  ignoreTags: ['a', 'pre', 'code'],
  validate: (_value, _type, token) => /^(?:https?:|mailto:)/i.test(token.toHref('https')),
};

export interface MessageNav {
  /** Href of the newer neighbour in the inbox, or null at the top. */
  prevHref: string | null;
  /** Href of the older neighbour, or null at the bottom. */
  nextHref: string | null;
  /** 1-based position within the inbox, when the message was found there. */
  position: number | null;
  total: number | null;
}

interface MessageViewProps {
  mailboxId: string;
  message: MessageDetail;
  nav?: MessageNav;
}

/**
 * Full message reader: a sticky back / prev-next toolbar over a centered
 * reading column. HTML body is already sanitised server-side by Jsoup
 * (script / iframe / img / style stripped). Parse it into React elements so
 * HTML entities are decoded once and React escapes text and link attributes.
 * Linkify adds links in text nodes, keeping existing anchors and markup intact.
 * Neither library is a sanitiser: only parse the backend's sanitised bodyHtml.
 *
 * Body preference: HTML if present, otherwise escaped plain text with links
 * and preserved whitespace. Never interpret markup in the plain alternative.
 * If both are missing (rare — extract failure) the reader shows a friendly
 * note instead of empty space.
 *
 * When the body contains something that looks like a verification / 2FA code
 * (the whole reason this webmail exists), it's surfaced in a copyable card
 * above the body so the user never has to hunt through Konami's markup.
 */
export function MessageView({ mailboxId, message, nav }: MessageViewProps) {
  const hasHtml = message.bodyHtml && message.bodyHtml.trim().length > 0;
  const hasPlain = message.bodyPlain && message.bodyPlain.trim().length > 0;
  const displayFrom = message.fromName || message.fromAddress || 'Noma\'lum';
  const otpCode = extractOtpCode(message.bodyPlain, message.bodyHtml);

  return (
    <div className="flex min-h-full flex-col">
      <MessageHotkeys
        backHref={`/${mailboxId}`}
        prevHref={nav?.prevHref ?? null}
        nextHref={nav?.nextHref ?? null}
      />

      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border bg-card/95 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:px-6">
        <Link
          href={`/${mailboxId}`}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>Inbox</span>
        </Link>
        {nav && (nav.prevHref || nav.nextHref) && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            {nav.position !== null && nav.total !== null && (
              <span className="mr-1 tabular-nums">
                {nav.position} / {nav.total}
              </span>
            )}
            <NavArrow href={nav.prevHref} label="Yangiroq xat (←)">
              <ChevronLeft className="h-4 w-4" />
            </NavArrow>
            <NavArrow href={nav.nextHref} label="Eskiroq xat (→)">
              <ChevronRight className="h-4 w-4" />
            </NavArrow>
          </div>
        )}
      </div>

      <article className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-5 sm:px-6 sm:py-6">
        <header className="space-y-4 border-b border-border pb-5">
          <h1 className="text-lg font-black leading-snug text-foreground sm:text-xl">
            {message.subject || '(mavzu yo\'q)'}
          </h1>
          <div className="flex items-start gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white shadow-sm"
              style={{ backgroundColor: mailAvatarColor(message.fromAddress || displayFrom) }}
              aria-hidden
            >
              {mailAvatarInitial(message.fromAddress || displayFrom)}
            </span>
            <dl className="grid min-w-0 flex-1 gap-1 text-xs sm:grid-cols-[6rem_1fr]">
              <dt className="font-semibold text-muted-foreground">Kimdan:</dt>
              <dd className="flex min-w-0 items-center gap-1 text-foreground">
                <span className="truncate">
                  <span className="font-semibold">{displayFrom}</span>
                  {message.fromAddress && message.fromName && (
                    <span className="ml-1 text-muted-foreground">&lt;{message.fromAddress}&gt;</span>
                  )}
                </span>
                {message.fromAddress && (
                  <CopyButton value={message.fromAddress} label="Manzilni nusxalash" />
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
              <dd className="text-foreground">
                {fullDateUz(message.receivedAt)}
                <span className="ml-1 text-muted-foreground">
                  ({relativeUz(message.receivedAt)})
                </span>
              </dd>
            </dl>
          </div>
        </header>

        {otpCode && (
          <aside className="flex flex-wrap items-center gap-3 rounded-xl border border-primary/25 bg-accent px-4 py-3 shadow-card">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <KeyRound className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wide text-accent-foreground">
                Tasdiqlash kodi topildi
              </p>
              <p className="font-mono text-xl font-black tracking-[0.3em] text-foreground">
                {otpCode}
              </p>
            </div>
            <CopyButton
              value={otpCode}
              label="Kodni nusxalash"
              className="border border-primary/30 bg-card px-3 py-2 text-primary hover:bg-card/70 hover:text-primary"
            >
              Nusxalash
            </CopyButton>
          </aside>
        )}

        {hasHtml ? (
          <div className="mail-html-body">
            <Linkify options={BODY_LINK_OPTIONS}>
              {parseHtml(message.bodyHtml ?? '')}
            </Linkify>
          </div>
        ) : hasPlain ? (
          <div className="mail-plain-body whitespace-pre-wrap font-sans">
            <Linkify options={BODY_LINK_OPTIONS}>{message.bodyPlain}</Linkify>
          </div>
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
              {message.attachments.map((att) => {
                const Icon = attachmentIcon(att.contentType);
                return (
                  <li key={att.attachmentId}>
                    <a
                      href={attachmentDownloadUrl(mailboxId, message.messageId, att.attachmentId)}
                      className="group inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs transition-colors hover:border-primary/40 hover:bg-muted"
                      // Backend always returns Content-Disposition: attachment,
                      // so this triggers a download rather than in-app preview.
                      download
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span className="max-w-[16rem] truncate font-semibold text-foreground">
                        {att.filename || 'ilova'}
                      </span>
                      <span className="text-muted-foreground">{formatBytes(att.sizeBytes)}</span>
                      <Download className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </article>
    </div>
  );
}

function NavArrow({
  href,
  label,
  children,
}: {
  href: string | null;
  label: string;
  children: React.ReactNode;
}) {
  const cls = cn(
    'inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors',
    href ? 'hover:bg-muted hover:text-foreground' : 'pointer-events-none opacity-30',
  );
  if (!href) {
    return <span className={cls}>{children}</span>;
  }
  return (
    <Link href={href} title={label} aria-label={label} className={cls}>
      {children}
    </Link>
  );
}

function attachmentIcon(contentType: string) {
  const ct = (contentType || '').toLowerCase();
  if (ct.startsWith('image/')) return FileImage;
  if (ct.includes('pdf') || ct.startsWith('text/')) return FileText;
  if (/zip|compressed|tar|rar|7z/.test(ct)) return FileArchive;
  return File;
}
