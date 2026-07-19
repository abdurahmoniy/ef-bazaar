import { ArrowUpRight, Mail } from 'lucide-react';

import { MailSidebar } from '@/components/mail/mail-sidebar';
import { MobileSidebar } from '@/components/mail/mobile-sidebar';
import { MAIN_SITE_URL } from '@/lib/site';
import type { MailboxSummary } from '@/lib/mail-types';

interface MailShellProps {
  mailboxes: MailboxSummary[];
  activeMailboxId: string | null;
  children: React.ReactNode;
}

/**
 * Standalone chrome for mail.efbazaar.uz, laid out like a desktop mail
 * client: fixed top bar, full-height sidebar column on the left, and a white
 * reading pane that scrolls independently. On mobile the sidebar collapses
 * into a hamburger drawer so the inbox is the first thing on screen.
 */
export function MailShell({ mailboxes, activeMailboxId, children }: MailShellProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="z-20 shrink-0 border-b border-border bg-card">
        <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <MobileSidebar mailboxes={mailboxes} activeMailboxId={activeMailboxId} />
            <a href={MAIN_SITE_URL} className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                <Mail className="h-4 w-4" />
              </span>
              <span className="truncate text-sm font-black text-foreground">
                eFBazaar <span className="font-semibold text-muted-foreground">Pochta</span>
              </span>
            </a>
          </div>
          <a
            href={`${MAIN_SITE_URL}/marketplace`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Bozorga qaytish
            <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 border-r border-border bg-background lg:flex lg:flex-col xl:w-80">
          <MailSidebar mailboxes={mailboxes} activeMailboxId={activeMailboxId} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-card">
          {children}
        </main>
      </div>
    </div>
  );
}
