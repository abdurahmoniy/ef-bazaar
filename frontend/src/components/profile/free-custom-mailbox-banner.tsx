import Link from 'next/link';
import { Mail } from 'lucide-react';

import { freeMailboxes } from '@/lib/account-email-badges';
import type { OwnedMailbox } from '@/lib/mailbox-slots';

/**
 * Mailboxes should not sit empty — custom ones, and trade boxes left behind
 * after the account was sold. One box: straight to linking it. Several: one
 * row to the list where each can be linked.
 */
export function FreeCustomMailboxBanner({ boxes, accountEmails }: { boxes: OwnedMailbox[]; accountEmails: string[] }) {
  const free = freeMailboxes(boxes, new Set(accountEmails.map((e) => e.trim().toLowerCase())));
  if (free.length === 0) return null;
  const single = free.length === 1 ? free[0] : null;
  return (
    <Link
      href={single ? `/mailboxes/custom/${encodeURIComponent(single.id)}/link` : '/mailboxes/custom'}
      className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-gold-border bg-gold-soft px-3 py-2 text-foreground transition hover:opacity-90 sm:px-4"
    >
      <span className="flex min-w-0 items-center gap-2.5">
        <Mail aria-hidden className="h-5 w-5 shrink-0 text-gold-foreground" />
        <span className="min-w-0 text-sm leading-snug">
          {single ? (
            <><strong className="break-all">{single.email}</strong> bo‘sh turibdi — akkountingizga ulaysizmi?</>
          ) : (
            <><strong>{free.length} ta pochta</strong> bo‘sh turibdi — akkountlaringizga ulaysizmi?</>
          )}
        </span>
      </span>
      <span className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-bold text-white">
        {single ? 'Ulash' : 'Ko‘rish'}
      </span>
    </Link>
  );
}
