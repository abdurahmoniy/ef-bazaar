'use client';

import { useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Wallet as WalletIcon } from 'lucide-react';

import { InvoicePanel } from '@/components/payment/invoice-panel';
import { TopUpForm } from '@/components/payment/top-up-form';
import { formatTiyin } from '@/lib/money';
import type {
  InvoiceResponse,
  WalletEntryResponse,
  WalletResponse,
} from '@/lib/payment-types';
import { walletHistoryRows } from '@/lib/wallet-history';
import { cn } from '@/lib/utils';

interface WalletViewProps {
  wallet: WalletResponse;
  initialInvoice: InvoiceResponse | null;
  history: WalletEntryResponse[];
}

export function WalletView({ wallet, initialInvoice, history }: WalletViewProps) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(initialInvoice);
  const rows = walletHistoryRows(history);

  const handleCreated = useCallback((created: InvoiceResponse) => {
    setInvoice(created);
  }, []);

  const handleExpired = useCallback(() => {
    // Deliberately does NOT clear the invoice. A user who was in their banking
    // app when the clock ran out comes back to a page that still shows the card
    // number and the amount — otherwise the transfer looks like it failed and
    // gets sent a second time. Two more reasons to keep it: an off-invoice
    // transfer lands in the admin's manual queue, which is the work this whole
    // design exists to avoid; and the PENDING row survives until the sweeper
    // runs (every 30s), so a preset tapped right now answers a bare 409.
    //
    // Re-runs the server fetches: a deposit that landed in the last seconds
    // still shows up as a fresh balance rather than a stale one.
    router.refresh();
  }, [router]);

  const handleDismissed = useCallback(() => {
    setInvoice(null);
  }, []);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
        <h1 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
          <WalletIcon className="h-4 w-4" aria-hidden="true" />
          Hamyon
        </h1>
        <p className="mt-1 text-3xl font-black tabular-nums text-foreground sm:text-4xl">
          {formatTiyin(wallet.availableTiyin)} <span className="text-2xl sm:text-3xl">so‘m</span>
        </p>
        <p className="mt-1 text-sm text-muted-foreground">Ishlatish mumkin bo‘lgan mablag‘</p>

        {(wallet.heldTiyin > 0 || wallet.withdrawPendingTiyin > 0) && (
          <dl className="mt-4 grid gap-2 border-t border-border pt-4 sm:grid-cols-2">
            {wallet.heldTiyin > 0 && (
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div>
                  <dt className="text-sm font-semibold tabular-nums text-foreground">
                    {formatTiyin(wallet.heldTiyin)} so‘m
                  </dt>
                  {/* A user who sees money they cannot spend, with no reason
                      given, opens a support ticket. */}
                  <dd className="text-sm text-muted-foreground">
                    Savdoda muzlatilgan — savdo yakunlangach ochiladi
                  </dd>
                </div>
              </div>
            )}
            {wallet.withdrawPendingTiyin > 0 && (
              <div>
                <dt className="text-sm font-semibold tabular-nums text-foreground">
                  {formatTiyin(wallet.withdrawPendingTiyin)} so‘m
                </dt>
                <dd className="text-sm text-muted-foreground">Yechish jarayonida</dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {invoice
        ? (
          <InvoicePanel
            invoice={invoice}
            onExpired={handleExpired}
            onDismiss={handleDismissed}
          />
        )
        : <TopUpForm onCreated={handleCreated} />}

      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
        <h2 className="text-base font-black text-foreground">Amaliyotlar</h2>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Hozircha amaliyot yo‘q.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {rows.map((row, index) => (
              <li
                // One row per ledger entry, and the entry id is not exposed —
                // a transaction that posts twice to USER_AVAILABLE for one
                // user would collide on the transaction id alone.
                key={`${row.transactionId}-${index}`}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">{row.label}</p>
                  <p className="text-sm text-muted-foreground">{row.when}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 text-sm font-black tabular-nums',
                    row.incoming ? 'text-primary' : 'text-foreground',
                  )}
                >
                  {row.amount}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
