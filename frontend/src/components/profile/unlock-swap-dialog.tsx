'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { Lock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { showUpgrade, type SwapCandidate } from '@/lib/mailbox-lock';
import { unlockMailbox, type OwnedMailbox } from '@/lib/mailbox-slots';
import { cn } from '@/lib/utils';

interface Props {
  mailbox: OwnedMailbox;
  plan: string;
  /** Ochiq qutilar; `swapCandidates()` natijasi. */
  candidates: SwapCandidate[];
  limit: number | null;
  onClose: () => void;
  onChanged: () => void;
}

/** Qulflangan qutini ochish: qaysi ochiq quti o'rniga qulflanishini tanlash. */
export function UnlockSwapDialog({ mailbox, plan, candidates, limit, onClose, onChanged }: Props) {
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (!picked || busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlockMailbox(mailbox.id, picked);
      onClose();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Qutini ochib bo‘lmadi');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && !busy) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/45" />
        <Dialog.Content
          onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
          onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
        >
          <div className="flex flex-col gap-1.5">
            <Dialog.Title className="break-all text-lg font-extrabold">
              {mailbox.email} ni ochish
            </Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {limit !== null ? `Tarifingizda ${limit} ta ochiq joy bor. ` : ''}
              Buning o‘rniga qaysi qutini qulflaymiz? Qulflangan quti o‘chirilmaydi.
            </Dialog.Description>
          </div>

          <fieldset className="flex flex-col gap-2" disabled={busy}>
            <legend className="sr-only">Qulflanadigan quti</legend>
            {candidates.length === 0 && (
              <p className="text-sm text-muted-foreground">Almashtirish uchun ochiq quti yo‘q.</p>
            )}
            {candidates.map((c) => {
              const disabled = c.disabledReason !== null;
              const selected = picked === c.id;
              return (
                <label
                  key={c.id}
                  className={cn(
                    'flex min-h-14 items-center gap-3 rounded-xl border px-3.5 py-2.5',
                    selected ? 'border-2 border-primary bg-accent' : 'border-border bg-card',
                    disabled ? 'cursor-not-allowed' : 'cursor-pointer',
                  )}
                >
                  <input
                    type="radio"
                    name="lockInstead"
                    value={c.id}
                    checked={selected}
                    disabled={disabled}
                    onChange={() => setPicked(c.id)}
                    className="size-[18px] shrink-0 accent-primary disabled:opacity-50"
                  />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className={cn('break-all text-sm font-bold', disabled && 'text-muted-foreground')}>{c.email}</span>
                    {c.disabledReason && (
                      <span className="text-xs text-muted-foreground">{c.disabledReason} — qulflab bo‘lmaydi</span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>

          {error && (
            <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <Button type="button" variant="outline" size="lg" onClick={onClose} disabled={busy}>
              Bekor qilish
            </Button>
            <Button type="button" size="lg" onClick={confirm} disabled={!picked || busy}>
              <Lock className="size-4" aria-hidden />
              {busy ? 'Kuting…' : 'Almashtirish'}
            </Button>
          </div>
          {showUpgrade(plan) && (
            <Link href="/plans" className="text-center text-sm font-semibold text-primary underline-offset-4 hover:underline dark:text-foreground">
              Yoki tarifni oshirib, ikkalasini ham ochiq qoldiring
            </Link>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
