import Link from 'next/link';
import { Check, Loader2, Lock } from 'lucide-react';

import { siteConfig } from '@/lib/site';
import { accessDescription, mailboxAccess } from '@/lib/mailbox-access';
import type { CustomMailbox } from '@/lib/custom-mailbox';
import { cn } from '@/lib/utils';

/** The user's custom boxes and what each is doing: linked, free, being set up, locked. */
export function CustomMailboxList({ boxes }: { boxes: CustomMailbox[] }) {
  if (boxes.length === 0) return null;
  return (
    <section aria-labelledby="my-custom-title" className="flex flex-col gap-2 sm:gap-3">
      <h2 id="my-custom-title" className="text-base font-extrabold sm:text-xl">Sizning custom qutilaringiz</h2>
      <ul className="grid gap-2 sm:grid-cols-3 sm:gap-3">
        {boxes.map((box) => (
          <li key={box.id}>
            <CustomMailboxRow box={box} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function CustomMailboxRow({ box }: { box: CustomMailbox }) {
  const access = mailboxAccess(box);
  const restricted = access === 'RECOVERY' || access === 'LOCKED';
  const free = box.provisioned && !restricted && !box.linkedAccountId;
  const linkHref = `/mailboxes/custom/${box.id}/link${box.activeSessionId ? `?session=${box.activeSessionId}` : ''}`;
  return (
    <article
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border-2 bg-card px-3 py-2 sm:flex-col sm:items-stretch sm:rounded-2xl sm:p-4',
        box.linkedAccountId && !restricted ? 'gold-ring' : free ? 'border-dashed border-gold-border' : 'border-border',
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5 sm:gap-2">
        <span className="truncate text-sm font-bold sm:text-base">{box.email}</span>
        {restricted ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground sm:text-sm">
            <Lock className="h-3.5 w-3.5" aria-hidden /> {access === 'RECOVERY' ? 'Recovery' : 'Qulflangan'}
          </span>
        ) : !box.provisioned ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Tayyorlanmoqda…
          </span>
        ) : box.linkedAccountId ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground sm:text-sm">
            <Check className="h-3.5 w-3.5 text-success" aria-hidden /> Akkountga ulangan
          </span>
        ) : (
          <span className="text-xs font-semibold text-warning sm:text-sm">
            {box.activeSessionId ? 'Ulanmoqda…' : 'Bo‘sh turibdi'}
          </span>
        )}
        {box.accessState && <span className="text-xs text-muted-foreground">{accessDescription(box)}</span>}
      </div>
      {restricted ? (
        <Link href={`${siteConfig.mailUrl}/settings/mailboxes?mailbox=${encodeURIComponent(box.id)}`} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-bold text-white">
          {box.accessState ? 'Free uchun tanlash' : 'O‘qish uchun tanlash'}
        </Link>
      ) : free ? (
        <Link href={linkHref} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-lg bg-primary px-3 text-sm font-bold text-white sm:min-h-11">
          {box.activeSessionId ? 'Davom etish' : 'Akkount ulash'}
        </Link>
      ) : null}
      {box.accessState === 'RECOVERY' && <a className="inline-flex min-h-11 items-center text-sm underline" href={`${siteConfig.mailUrl}/${encodeURIComponent(box.id)}`}>Konami xavfsizlik xatlari</a>}
    </article>
  );
}
