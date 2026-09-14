import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Circle, Inbox, Paperclip } from 'lucide-react';

import { SmartTradeActions } from '@/components/admin/smart-trade-actions';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getAdminMailboxInbox, getAdminMailboxMessage } from '@/lib/mailbox-admin-server';
import { formatListingDate } from '@/lib/marketplace-format';
import {
  ROLE_LABEL_UZ,
  SMART_STEPS,
  pickMailboxSide,
  sidesWithMailbox,
  stepIndex,
} from '@/lib/smart-trade-admin';
import { getSmartTrade } from '@/lib/smart-trade-admin-server';
import type { SmartTradeSide } from '@/lib/smart-trade-admin-types';
import { TRADE_STATE_LABEL_UZ } from '@/lib/trade-types';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface AdminTradePageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ mb?: string; msg?: string }>;
}

/**
 * One SMART trade, split in two on desktop: where it stands and what the worker
 * is waiting for on the left, the trade's own escrow mailbox on the right — so
 * an admin reads Konami's mail and supplies the missing value in one screen.
 *
 * The open mailbox and message live in the URL (`?mb=SELLER&msg=…`), so the
 * switch and the message list are plain links that survive a refresh.
 */
export default async function AdminTradePage({ params, searchParams }: AdminTradePageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};

  const result = await getSmartTrade(id);
  if (!result.ok) {
    return <ApiErrorPanel title="Savdo topilmadi" error={result.error} />;
  }
  const detail = result.data;
  const { trade } = detail;
  const boxes = sidesWithMailbox(detail);
  const open = pickMailboxSide(detail, query.mb);
  const current = stepIndex(trade.state);

  return (
    <div className="space-y-4">
      <Link
        href="/admin/trades"
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Faol savdolar
      </Link>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* ── Left: the trade ─────────────────────────────────────────── */}
        <section className="space-y-4">
          <header className="rounded-xl border border-border bg-card p-4">
            <p className="font-mono text-xs text-muted-foreground">{trade.id}</p>
            <h1 className="mt-1 text-lg font-black text-foreground">
              {TRADE_STATE_LABEL_UZ[trade.state]}
            </h1>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Sotuvchi</dt>
                <dd className="font-semibold text-foreground">{trade.sellerName ?? "o'chirilgan"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Oluvchi</dt>
                <dd className="font-semibold text-foreground">{trade.buyerName ?? "o'chirilgan"}</dd>
              </div>
            </dl>
            {trade.kind !== 'SALE' && (
              <p className="mt-2 text-xs font-bold text-muted-foreground">Obmen — ikki tomonning ham pochtasi bor</p>
            )}
          </header>

          <ol className="space-y-1.5 rounded-xl border border-border bg-card p-4" aria-label="Bosqichlar">
            {SMART_STEPS.map((step, index) => {
              const passed = current >= 0 && index < current;
              const here = index === current;
              return (
                <li
                  key={step}
                  aria-current={here ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 text-sm',
                    here ? 'font-black text-foreground' : passed ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {passed || here
                    ? <CheckCircle2 className={cn('h-4 w-4', here && 'animate-pulse')} aria-hidden="true" />
                    : <Circle className="h-4 w-4" aria-hidden="true" />}
                  {TRADE_STATE_LABEL_UZ[step]}
                </li>
              );
            })}
            {current < 0 && (
              <li className="text-sm font-semibold text-muted-foreground">
                Hozirgi holat: {TRADE_STATE_LABEL_UZ[trade.state]}
              </li>
            )}
          </ol>

          <SmartTradeActions
            tradeId={trade.id}
            action={trade.expectedAction}
            sides={boxes}
            selectedRole={open?.role ?? null}
          />

          <div className="space-y-2">
            {detail.sides.map((side) => (
              <SideProgress key={side.role} side={side} />
            ))}
          </div>
        </section>

        {/* ── Right: the escrow mailbox ───────────────────────────────── */}
        <section className="space-y-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {open === null ? (
            <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Bu savdoda hali pochta qutisi yo&apos;q.
            </p>
          ) : (
            <>
              {boxes.length > 1 && (
                <nav className="flex gap-2" aria-label="Pochta qutisi">
                  {boxes.map((side) => (
                    <Link
                      key={side.role}
                      href={`/admin/trades/${trade.id}?mb=${side.role}`}
                      aria-current={side.role === open.role ? 'page' : undefined}
                      className={cn(
                        'flex-1 rounded-lg border px-3 py-2 text-center text-xs font-bold transition',
                        side.role === open.role
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border text-foreground hover:bg-muted',
                      )}
                    >
                      {ROLE_LABEL_UZ[side.role]} pochtasi
                    </Link>
                  ))}
                </nav>
              )}
              <MailboxPane tradeId={trade.id} side={open} messageId={query.msg} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function SideProgress({ side }: { side: SmartTradeSide }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 text-xs">
      <p className="font-black text-foreground">{ROLE_LABEL_UZ[side.role]}</p>
      {side.mailboxEmail ? (
        <p className="mt-1 font-mono text-muted-foreground">{side.mailboxEmail}</p>
      ) : (
        <p className="mt-1 text-muted-foreground">Pochta qutisi yo&apos;q</p>
      )}
      <ul className="mt-2 space-y-0.5 text-muted-foreground">
        <li>Email kodi: {side.emailChangeCode ? <span className="font-mono text-foreground">{side.emailChangeCode}</span> : '—'}</li>
        <li>Email almashtirildi: {side.emailChangedAt ? formatListingDate(side.emailChangedAt) : '—'}</li>
        <li>Konami tasdiqlandi: {side.konamiVerifiedAt ? formatListingDate(side.konamiVerifiedAt) : '—'}</li>
      </ul>
    </div>
  );
}

async function MailboxPane({
  tradeId,
  side,
  messageId,
}: {
  tradeId: string;
  side: SmartTradeSide;
  messageId: string | undefined;
}) {
  const mailboxId = side.mailboxId as string;
  const base = `/admin/trades/${tradeId}?mb=${side.role}`;

  if (!side.mailboxProvisioned) {
    return (
      <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
        {side.mailboxEmail} hali tayyor emas — Mailcow tasdiqlagach xatlar shu yerda ko&apos;rinadi.
      </p>
    );
  }

  if (messageId) {
    const message = await getAdminMailboxMessage(mailboxId, messageId);
    if (!message.ok) {
      return <ApiErrorPanel title="Xat yuklanmadi" error={message.error} />;
    }
    const m = message.data;
    const attachmentBase = `/api/trade/v1/admin/mailboxes/${mailboxId}/messages/${m.messageId}/attachments`;
    return (
      <article className="space-y-3 rounded-xl border border-border bg-card p-4">
        <Link href={base} className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Xatlar
        </Link>
        <header className="space-y-1">
          <h2 className="text-base font-black text-foreground">{m.subject || '(mavzusiz)'}</h2>
          <p className="text-xs text-muted-foreground">
            {m.fromName || m.fromAddress} · {formatListingDate(m.receivedAt)}
          </p>
        </header>
        {m.bodyHtml ? (
          <div
            className="mail-html-body text-sm"
            // Sanitised server-side by Jsoup in trade-service (script / iframe /
            // on* attributes stripped) — the same guarantee the mailbox page relies on.
            dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
          />
        ) : (
          <pre className="whitespace-pre-wrap break-words text-sm text-foreground">{m.bodyPlain ?? ''}</pre>
        )}
        {m.attachments.length > 0 && (
          <ul className="space-y-1 border-t border-border pt-2">
            {m.attachments.map((a) => (
              <li key={a.attachmentId}>
                <a
                  href={`${attachmentBase}/${encodeURIComponent(a.attachmentId)}`}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground hover:underline"
                >
                  <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
                  {a.filename ?? 'fayl'}
                </a>
              </li>
            ))}
          </ul>
        )}
      </article>
    );
  }

  const inbox = await getAdminMailboxInbox(mailboxId, 25, 0);
  if (!inbox.ok) {
    return <ApiErrorPanel title="Pochta yuklanmadi" error={inbox.error} />;
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <header className="flex items-center gap-2 border-b border-border px-4 py-3">
        <Inbox className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 truncate font-mono text-xs text-foreground">{side.mailboxEmail}</span>
        <span className="ml-auto text-xs text-muted-foreground">{inbox.data.total} ta</span>
      </header>
      {inbox.data.messages.length === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">Hozircha xat yo&apos;q.</p>
      ) : (
        <ul>
          {inbox.data.messages.map((message) => (
            <li key={message.messageId} className="border-b border-border last:border-0">
              <Link
                href={`${base}&msg=${encodeURIComponent(message.messageId)}`}
                className="block px-4 py-3 transition hover:bg-muted/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn('min-w-0 truncate text-sm', message.seen ? 'text-foreground' : 'font-black text-foreground')}>
                    {message.subject || '(mavzusiz)'}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {formatListingDate(message.receivedAt)}
                  </span>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {message.fromName || message.fromAddress} — {message.snippet}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
