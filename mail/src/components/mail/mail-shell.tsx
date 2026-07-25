import { ArrowUpRight } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { MailSidebar } from '@/components/mail/mail-sidebar';
import { MobileSidebar } from '@/components/mail/mobile-sidebar';
import { ThemeToggle } from '@/components/theme/theme-toggle';
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
    <div className="flex h-dvh flex-col overflow-hidden bg-transparent">
      <header className="z-20 shrink-0 border-b border-border surface-nav pt-[env(safe-area-inset-top)]">
        <div className="flex h-14 items-center justify-between gap-3 px-3 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <MobileSidebar mailboxes={mailboxes} activeMailboxId={activeMailboxId} />
            <Logo size="sm" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ThemeToggle />
            <a
              href={`${MAIN_SITE_URL}/marketplace`}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-muted active:bg-muted"
            >
              <span className="hidden sm:inline">Bozorga qaytish</span>
              <span className="sm:hidden">Bozor</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Translucent so the capsule backdrop reads through, matching the
            marketplace shell. The reading pane stays opaque — arbitrary email
            markup must never sit on a tinted surface. */}
        <aside className="hidden w-72 shrink-0 border-r border-border bg-surface-alt/80 backdrop-blur lg:flex lg:flex-col xl:w-80">
          <MailSidebar mailboxes={mailboxes} activeMailboxId={activeMailboxId} />
        </aside>
        <main className="flex min-w-0 flex-1 flex-col overflow-y-auto bg-card pb-[env(safe-area-inset-bottom)]">
          {children}
        </main>
      </div>
    </div>
  );
}
