import Link from 'next/link';
import { Mail } from 'lucide-react';

import { freeCustomMailboxes } from '@/lib/account-email-badges';
import type { CustomMailbox } from '@/lib/custom-mailbox';

/** Custom boxes should not sit empty: one row per free box, straight to linking. */
export function FreeCustomMailboxBanner({ boxes }: { boxes: CustomMailbox[] }) {
  const free = freeCustomMailboxes(boxes);
  if (free.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {free.map((box) => (
        <Link
          key={box.id}
          href={`/mailboxes/custom/${encodeURIComponent(box.id)}/link`}
          className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-gold-border bg-gold-soft px-3 py-2 text-foreground transition hover:opacity-90 sm:px-4"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <Mail aria-hidden className="h-5 w-5 shrink-0 text-gold-foreground" />
            <span className="min-w-0 text-sm leading-snug">
              <strong className="break-all">{box.email}</strong> bo‘sh turibdi — boshqa akkountingizga ulaysizmi?
            </span>
          </span>
          <span className="inline-flex min-h-10 shrink-0 items-center rounded-lg bg-primary px-3 text-sm font-bold text-white">Ulash</span>
        </Link>
      ))}
    </div>
  );
}
