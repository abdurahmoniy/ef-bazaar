import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { MailSidebar } from '@/components/mail/mail-sidebar';
import type { MailboxSummary } from '@/lib/mail-types';
import type { User } from '@/lib/types';

interface MailShellProps {
  user: User;
  mailboxes: MailboxSummary[];
  activeMailboxId: string | null;
  children: React.ReactNode;
}

/**
 * Two-column layout for /mail routes. Reuses MarketplaceShell for the top nav
 * (so the "Sotish" / notification-bell / profile buttons stay one keystroke
 * away) and adds the mailbox sidebar next to the reader pane.
 *
 * On mobile the sidebar stacks above the reader — a proper hamburger sheet
 * is deferred, but the stack keeps every mailbox reachable on a phone.
 */
export function MailShell({ user, mailboxes, activeMailboxId, children }: MailShellProps) {
  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <MailSidebar mailboxes={mailboxes} activeMailboxId={activeMailboxId} />
        <div className="min-w-0">{children}</div>
      </div>
    </MarketplaceShell>
  );
}
