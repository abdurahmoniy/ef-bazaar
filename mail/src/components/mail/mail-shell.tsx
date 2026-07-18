import { ArrowUpRight, Mail } from 'lucide-react';

import { MailSidebar } from '@/components/mail/mail-sidebar';
import { MAIN_SITE_URL } from '@/lib/site';
import type { MailboxSummary } from '@/lib/mail-types';

interface MailShellProps {
  mailboxes: MailboxSummary[];
  activeMailboxId: string | null;
  children: React.ReactNode;
}

/**
 * Standalone chrome for mail.efbazaar.uz: slim top bar with the brand and a
 * link back to the marketplace, then the two-column sidebar + reader grid.
 * On mobile the sidebar stacks above the reader — a proper hamburger sheet
 * is deferred, but the stack keeps every mailbox reachable on a phone.
 */
export function MailShell({ mailboxes, activeMailboxId, children }: MailShellProps) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="container-page flex h-14 items-center justify-between gap-3">
          <a href={MAIN_SITE_URL} className="flex min-w-0 items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Mail className="h-4 w-4" />
            </span>
            <span className="truncate text-sm font-black text-foreground">
              eFBazaar <span className="font-semibold text-muted-foreground">Pochta</span>
            </span>
          </a>
          <a
            href={`${MAIN_SITE_URL}/marketplace`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
          >
            Bozorga qaytish
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <main className="container-page py-4">
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <MailSidebar mailboxes={mailboxes} activeMailboxId={activeMailboxId} />
          <div className="min-w-0">{children}</div>
        </div>
      </main>
    </div>
  );
}
