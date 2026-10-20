'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';

import { siteConfig } from '@/lib/site';
import { Button } from '@/components/ui/button';
import { UnlockSwapDialog } from '@/components/profile/unlock-swap-dialog';
import { showUpgrade, type SwapCandidate } from '@/lib/mailbox-lock';
import { accessDescription, mailboxAccess } from '@/lib/mailbox-access';
import type { OwnedMailbox } from '@/lib/mailbox-slots';

interface Props {
  mailbox: OwnedMailbox;
  plan: string;
  limit: number | null;
  candidates: SwapCandidate[];
  onChanged: () => void;
  /** `?mailbox=<id>` havolasi: dialog sahifa ochilishi bilan ochiladi. */
  autoOpen?: boolean;
}

/**
 * Qulflangan quti. Xiralashtirilgan qism FAQAT soxta skeleton shakllar:
 * haqiqiy quti ma'lumoti (manzildan boshqa) bu yerga hech qachon
 * chizilmaydi. Manzil esa xira emas, aniq o'qiladi.
 */
export function LockedMailboxCard({ mailbox, plan, limit, candidates, onChanged, autoOpen = false }: Props) {
  const [open, setOpen] = useState(autoOpen);

  return (
    <article
      aria-label={`Qulflangan quti ${mailbox.email}`}
      className="relative grid min-h-36 overflow-hidden rounded-2xl border border-dashed border-amber-500/60 bg-card"
    >
      <div aria-hidden className="col-start-1 row-start-1 flex flex-col gap-3.5 p-4 opacity-70 blur-[5px]">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-full bg-muted-foreground/40" />
          <div className="flex flex-col gap-1.5">
            <span className="h-3 w-44 rounded-md bg-muted-foreground/30" />
            <span className="h-2.5 w-28 rounded-md bg-muted-foreground/30" />
          </div>
        </div>
        <div className="flex gap-2">
          <span className="h-10 w-28 rounded-lg bg-muted-foreground/30" />
          <span className="h-10 w-16 rounded-lg bg-muted-foreground/30" />
        </div>
      </div>

      <div className="relative col-start-1 row-start-1 flex flex-wrap items-center justify-between gap-3 bg-card/75 p-4 backdrop-blur-[2px]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-800 dark:text-amber-300">
            <Lock className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300">
              {mailboxAccess(mailbox) === 'RECOVERY' ? 'Recovery' : 'Qulflangan'}
            </span>
            <span className="break-all text-sm font-bold text-foreground">{mailbox.email}</span>
            {mailbox.accessState && <span className="max-w-xs text-xs">{accessDescription(mailbox)}</span>}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {mailbox.accessState === 'RECOVERY' && <a className="inline-flex min-h-11 items-center text-sm font-semibold underline" href={`${siteConfig.mailUrl}/${encodeURIComponent(mailbox.id)}`}>Konami xatlarini o‘qish</a>}
          {showUpgrade(plan) && (
            <Button asChild size="sm" className="min-h-11">
              <Link href="/plans">Tarifni oshirish</Link>
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 text-foreground underline"
            onClick={() => setOpen(true)}
          >
            Shuni ochish
          </Button>
        </div>
      </div>

      {open && (
        <UnlockSwapDialog
          mailbox={mailbox}
          plan={plan}
          limit={limit}
          candidates={candidates}
          onClose={() => setOpen(false)}
          onChanged={onChanged}
        />
      )}
    </article>
  );
}
