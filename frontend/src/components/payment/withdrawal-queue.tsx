'use client';

import { useState, useTransition } from 'react';
import { Check, Copy, CreditCard, Eye, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatTiyin } from '@/lib/money';
import {
  closeWithdrawal,
  formatPan,
  revealWithdrawalPan,
  type WithdrawalTicket,
} from '@/lib/withdrawal';

/**
 * The payout queue an admin works through.
 *
 * <p>The money is already frozen by the time a ticket appears here, so the two
 * buttons are the whole decision: "paid" takes it off the platform, "reject"
 * gives it back. Neither can run twice — the server refuses a closed ticket —
 * so a double click cannot pay and refund the same ticket.
 */
export function WithdrawalQueue({ initialItems }: { initialItems: WithdrawalTicket[] }) {
  const [items, setItems] = useState(initialItems);

  function drop(id: string) {
    setItems((current) => current.filter((t) => t.id !== id));
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Kutayotgan pul yechish so&apos;rovi yo&apos;q.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((ticket) => (
        <TicketRow key={ticket.id} ticket={ticket} onClosed={() => drop(ticket.id)} />
      ))}
    </ul>
  );
}

function TicketRow({
  ticket,
  onClosed,
}: {
  ticket: WithdrawalTicket;
  onClosed: () => void;
}) {
  const [pan, setPan] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, startWork] = useTransition();

  function reveal() {
    setError(null);
    startWork(async () => {
      const result = await revealWithdrawalPan(ticket.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPan(result.data);
    });
  }

  async function copyPan() {
    if (!pan) return;
    try {
      await navigator.clipboard.writeText(pan);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the number is on screen to read.
    }
  }

  function close(outcome: 'paid' | 'reject') {
    setError(null);
    startWork(async () => {
      const result = await closeWithdrawal(ticket.id, outcome, note);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClosed();
    });
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-lg font-black tabular-nums text-foreground">
            {formatTiyin(ticket.amountTiyin)} so&apos;m
          </p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{ticket.holderName}</p>
          <p className="text-sm text-muted-foreground">
            {ticket.phone}
            {ticket.telegramUsername && (
              <>
                {' · '}
                <a
                  className="text-primary underline-offset-2 hover:underline"
                  href={`https://t.me/${ticket.telegramUsername}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  @{ticket.telegramUsername}
                </a>
              </>
            )}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{ticket.userId}</p>
        </div>

        <div className="min-w-[13rem]">
          {pan ? (
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded bg-muted/60 px-2 py-1 font-mono text-sm text-foreground">
                {formatPan(pan)}
              </code>
              <Button type="button" variant="ghost" size="sm" onClick={copyPan}>
                <Copy className="mr-1 h-3.5 w-3.5" />
                {copied ? 'Nusxalandi' : 'Nusxa'}
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={reveal}
              disabled={busy}
            >
              <Eye className="mr-2 h-4 w-4" />
              Karta raqamini ko&apos;rsatish
            </Button>
          )}
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <CreditCard className="h-3 w-3" aria-hidden="true" />
            •••• {ticket.last4}
          </p>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Izoh (foydalanuvchiga ko'rinadi)"
          maxLength={256}
        />
        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="flex gap-2">
          <Button
            type="button"
            className="flex-1"
            onClick={() => close('paid')}
            disabled={busy}
          >
            <Check className="mr-2 h-4 w-4" />
            To&apos;landi
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => close('reject')}
            disabled={busy}
          >
            <X className="mr-2 h-4 w-4" />
            Rad etish
          </Button>
        </div>
      </div>
    </li>
  );
}
