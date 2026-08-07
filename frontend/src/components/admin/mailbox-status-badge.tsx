import { Badge } from '@/components/ui/badge';
import type { AdminMailbox } from '@/lib/mailbox-admin-types';
import { cn } from '@/lib/utils';

type Variant = React.ComponentProps<typeof Badge>['variant'];

/**
 * One badge answering "how did this mailbox get here and is it usable":
 * deleted → pending (worker hasn't confirmed Mailcow) → admin / trade origin.
 * The leading dot carries the same signal at a glance in dense lists.
 */
export function MailboxStatusBadge({
  mailbox,
  className,
}: {
  mailbox: AdminMailbox;
  className?: string;
}) {
  const { label, variant, dot } = describe(mailbox);
  return (
    <Badge variant={variant} className={cn('shrink-0', className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
      {label}
    </Badge>
  );
}

function describe(mailbox: AdminMailbox): { label: string; variant: Variant; dot: string } {
  if (mailbox.deletedAt) {
    return { label: "o'chirilgan", variant: 'danger', dot: 'bg-destructive' };
  }
  if (!mailbox.provisionedAt) {
    return { label: 'kutilmoqda', variant: 'warn', dot: 'bg-amber-500 animate-pulse' };
  }
  if (mailbox.source === 'ADMIN') {
    return { label: 'admin', variant: 'info', dot: 'bg-sky-500' };
  }
  return { label: 'savdo', variant: 'muted', dot: 'bg-muted-foreground/60' };
}
