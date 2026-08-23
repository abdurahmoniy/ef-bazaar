'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Loader2, Trash2 } from 'lucide-react';

import { deleteMailboxAction } from '@/app/admin/mailboxes/actions';
import { Button } from '@/components/ui/button';

/**
 * Deletes a mailbox nobody holds.
 *
 * <p>Asks first, and names the address in the question: the addresses differ
 * by eight characters and the panel shows a lot of them at once.
 *
 * <p>Not offered at all for a mailbox with an owner or a live trade — the
 * server refuses those, and a button that only ever fails is worse than no
 * button. The reason is shown instead, so it is clear the option exists and
 * why it is closed.
 */
export function MailboxDeleteButton({
  mailboxId,
  email,
  ownerUserId,
  tradeId,
  deletedAt,
}: {
  mailboxId: string;
  email: string;
  ownerUserId: string | null;
  tradeId: string | null;
  deletedAt: string | null;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, startDeleting] = useTransition();

  if (deletedAt) {
    return <span className="text-xs font-semibold text-muted-foreground">O&apos;chirilgan</span>;
  }
  if (ownerUserId) {
    return (
      <span className="text-xs font-semibold text-muted-foreground">
        Foydalanuvchiga biriktirilgan — o&apos;chirib bo&apos;lmaydi
      </span>
    );
  }
  if (tradeId) {
    return (
      <span className="text-xs font-semibold text-muted-foreground">
        Savdoda ishlatilmoqda — o&apos;chirib bo&apos;lmaydi
      </span>
    );
  }

  function remove() {
    setError(null);
    startDeleting(async () => {
      const result = await deleteMailboxAction(mailboxId);
      if (!result.ok) {
        setError(result.error ?? "O'chirib bo'lmadi");
        setConfirming(false);
        return;
      }
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5">
        <p className="text-xs font-semibold text-foreground">
          <span className="font-mono">{email}</span> o&apos;chirilsinmi?
        </p>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)}>
            Bekor
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={remove}
            disabled={deleting}
          >
            {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ha, o&apos;chir
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setConfirming(true)}
        aria-label="Pochta qutisini o'chirish"
      >
        <Trash2 className="mr-2 h-4 w-4" />
        O&apos;chirish
      </Button>
      {error && <span className="text-xs font-semibold text-destructive">{error}</span>}
    </div>
  );
}
