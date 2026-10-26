import { ArrowUp, Lock } from 'lucide-react';

import { MAIN_SITE_URL } from '@/lib/site';
import type { MailboxSummary } from '@/lib/mail-types';

/** Made-up subjects under the blur. The server serves no content for a locked mailbox. */
export const FAKE_ROWS = [
  'Hisobingiz xavfsizligi',
  'Parolni tiklash so‘rovi',
  'Yangi qurilmadan kirish',
  'Tasdiqlash kodi',
  'Haftalik yangiliklar',
  'Hisob sozlamalari o‘zgardi',
  'Xush kelibsiz',
  'Kirish urinishi',
];

export function upgradeUrl(): string {
  return `${MAIN_SITE_URL}/plans`;
}

export function swapUrl(mailboxId: string): string {
  return `/settings/mailboxes?mailbox=${encodeURIComponent(mailboxId)}`;
}

export function LockedMailbox({ mailbox, plan }: { mailbox: MailboxSummary; plan?: string | null }) {
  const upgrade = plan === 'STANDARD';
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <Lock className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-foreground">{mailbox.displayName || mailbox.email}</p>
          <p className="text-xs text-muted-foreground">Qulflangan · tarif limitidan tashqarida</p>
        </div>
      </div>
      <div className="relative min-h-[28rem] flex-1 overflow-hidden">
        <ul aria-hidden className="pointer-events-none select-none opacity-75 blur-[6px]">
          {FAKE_ROWS.map((subject) => (
            <li key={subject} className="flex items-center gap-4 border-b border-border px-6 py-4">
              <span className="h-9 w-9 shrink-0 rounded-full bg-muted" />
              <span className="h-3 w-40 shrink-0 rounded bg-border" />
              <span className="flex-1 truncate text-sm text-muted-foreground">{subject}</span>
              <span className="h-2.5 w-14 shrink-0 rounded bg-muted" />
            </li>
          ))}
        </ul>
        <div className="absolute inset-0 grid place-items-center bg-background/40 p-4 sm:p-6">
          <div className="flex w-full max-w-md flex-col items-center gap-3.5 rounded-2xl border border-border bg-card p-6 text-center shadow-xl sm:p-8">
            <span className="grid h-16 w-16 place-items-center rounded-2xl bg-accent text-accent-foreground">
              <Lock className="h-7 w-7" aria-hidden />
            </span>
            <h1 className="text-xl font-extrabold text-card-foreground">Bu quti qulflangan</h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Bu quti tarifingizning umumiy o‘qish limitidan tashqarida. O‘qish uchun boshqa quti o‘rniga shuni tanlang.
              Xatlar o‘chirilmagan — saqlanib turibdi.
            </p>
            {upgrade && <a
              href={upgradeUrl()}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-base font-bold text-primary-foreground hover:opacity-90"
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
              Tarifni oshirish
            </a>}
            <a href={swapUrl(mailbox.id)} className="text-sm font-semibold text-accent-foreground underline underline-offset-2 hover:opacity-80">
              Boshqa qutini qulflab, shuni ochish
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
