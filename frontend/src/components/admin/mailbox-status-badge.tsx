import type { AdminMailbox } from '@/lib/mailbox-admin-types';
import { cn } from '@/lib/utils';

/**
 * One badge answering "how did this mailbox get here and is it usable":
 * deleted → pending (worker hasn't confirmed Mailcow) → trade / admin origin.
 */
export function MailboxStatusBadge({ mailbox }: { mailbox: AdminMailbox }) {
  const { label, tone } = describe(mailbox);
  return (
    <span
      className={cn(
        'rounded-md px-2 py-0.5 text-xs font-black uppercase tracking-wide',
        tone,
      )}
    >
      {label}
    </span>
  );
}

function describe(mailbox: AdminMailbox): { label: string; tone: string } {
  if (mailbox.deletedAt) {
    return { label: "o'chirilgan", tone: 'bg-destructive/10 text-destructive' };
  }
  if (!mailbox.provisionedAt) {
    return { label: 'kutilmoqda', tone: 'bg-amber-100 text-amber-800' };
  }
  if (mailbox.source === 'ADMIN') {
    return { label: 'admin', tone: 'bg-primary/10 text-primary' };
  }
  return { label: 'savdo', tone: 'bg-muted text-muted-foreground' };
}
