import Link from 'next/link';

import { freeMailboxes } from '@/lib/account-email-badges';
import type { OwnedMailbox } from '@/lib/mailbox-slots';

/** Trade boxes left behind after a sale: they can carry another account too. */
export function FreeTradeMailboxList({ boxes, accountEmails }: { boxes: OwnedMailbox[]; accountEmails: string[] }) {
  const free = freeMailboxes(boxes, new Set(accountEmails.map((e) => e.trim().toLowerCase())))
    .filter((b) => b.kind !== 'CUSTOM');
  if (free.length === 0) return null;
  return (
    <section aria-labelledby="free-trade-title" className="flex flex-col gap-2 sm:gap-3">
      <div>
        <h2 id="free-trade-title" className="text-base font-extrabold sm:text-xl">Bo‘sh qolgan savdo pochtalari</h2>
        <p className="text-xs text-muted-foreground sm:text-sm">Akkount sotilgach bo‘shagan pochtalar — ularga boshqa akkountingizni ulashingiz mumkin.</p>
      </div>
      <ul className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        {free.map((box) => (
          <li key={box.id}>
            <article className="flex items-center justify-between gap-3 rounded-xl border-2 border-dashed border-border bg-card px-3 py-2 sm:flex-col sm:items-stretch sm:rounded-2xl sm:p-4">
              <span className="min-w-0 truncate text-sm font-bold sm:text-base">{box.email}</span>
              <Link
                href={`/mailboxes/custom/${encodeURIComponent(box.id)}/link`}
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-bold text-white sm:min-h-11"
              >
                Akkount ulash
              </Link>
            </article>
          </li>
        ))}
      </ul>
    </section>
  );
}
