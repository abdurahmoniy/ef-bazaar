import Link from 'next/link';
import { ArrowUpRight, BadgeCheck, Radio, Users } from 'lucide-react';
import type { PartnerApplication } from '@/lib/partners';

export function PartnerChannelCard({ application }: { application: PartnerApplication | null }) {
  const approved = application?.status === 'APPROVED' ? application : null;

  return (
    <Link href="/partner" className="mt-4 block rounded-xl border border-primary/15 bg-primary/5 p-4 transition hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-primary">Hamkor kanal</span>
        {approved && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"><BadgeCheck aria-hidden className="h-3.5 w-3.5" />Faol</span>}
      </div>
      <div className="mt-3 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Radio aria-hidden className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-sm font-bold text-foreground">{approved?.channelTitle || (approved?.channelUsername ? `@${approved.channelUsername}` : 'Telegram kanalingiz')}</h2>
          {approved?.channelUsername && <p className="mt-0.5 break-all text-xs text-muted-foreground">@{approved.channelUsername}</p>}
          {approved?.subscriberCount != null && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Users aria-hidden className="h-3.5 w-3.5 shrink-0" />{approved.subscriberCount.toLocaleString('uz-UZ')} obunachi</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-primary/10 pt-3">
        <p className="text-xs text-muted-foreground">E’lonlar, narxlar va daromad</p>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Hamkor paneli<ArrowUpRight aria-hidden className="h-4 w-4" /></span>
      </div>
    </Link>
  );
}
