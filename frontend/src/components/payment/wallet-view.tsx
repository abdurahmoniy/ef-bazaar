'use client';

import Link from 'next/link';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  ArrowUpRight,
  CheckCircle2,
  Gift,
  Handshake,
  History,
  Lock,
  Megaphone,
  RotateCcw,
  ShieldAlert,
  Snowflake,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { InvoicePanel } from '@/components/payment/invoice-panel';
import { TipCallout } from '@/components/help/tip-callout';
import { TopUpForm } from '@/components/payment/top-up-form';
import { WithdrawForm } from '@/components/payment/withdraw-form';
import { useInvoiceWatch } from '@/hooks/use-invoice-watch';
import { getWalletHistory } from '@/lib/payment-client';
import { formatTiyin } from '@/lib/money';
import type {
  InvoiceResponse,
  TransactionKind,
  WalletEntryResponse,
  WalletResponse,
} from '@/lib/payment-types';
import { walletHistoryRows } from '@/lib/wallet-history';
import { cn } from '@/lib/utils';
import { GrowthLink } from '@/components/growth/growth-link';

interface WalletViewProps {
  wallet: WalletResponse;
  initialInvoice: InvoiceResponse | null;
  initialHistory?: WalletEntryResponse[];
  history?: WalletEntryResponse[];
  /** Contact hint passed on to withdrawal tickets. */
  telegramUsername?: string | null;
  /** Pre-fills the top-up box; see TopUpForm.initialAmount. */
  topUpAmount?: number;
  /** Same-origin path the user was sent here from, if any. */
  returnTo?: string;
}

type WalletTab = 'topup' | 'withdraw' | 'history';
type HistoryFilter = 'all' | 'in' | 'out';

type TxIcon = { icon: React.ReactNode; bg: string };

const ICON_CLASS = 'h-4.5 w-4.5';

/**
 * Ikon TURGA qarab tanlanadi, matn bo'lagiga emas.
 *
 * <p>Ilgari bu funksiya nomdan bo'lak qidirardi ("muzlatildi",
 * "qaytdi"). Yangi tur qo'shilganda uning nomi hech bir bo'lakka
 * tushmas va u jimgina umumiy ikon bilan chiqardi — hamkorlik va
 * referal yozuvlari aynan shunday ajralmay qolgan edi. Tur bo'yicha
 * tanlaganda unutilgan tur kompilyatsiyada ko'rinadi.
 */
const KIND_ICONS: Partial<Record<TransactionKind, TxIcon>> = {
  DEPOSIT: {
    icon: <ArrowDownLeft className={cn(ICON_CLASS, 'text-emerald-600 dark:text-emerald-400')} />,
    bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
  },
  TRADE_HOLD: {
    icon: <Lock className={cn(ICON_CLASS, 'text-amber-600 dark:text-amber-400')} />,
    bg: 'bg-amber-500/10 dark:bg-amber-400/10',
  },
  TRADE_RELEASE: {
    icon: <RotateCcw className={cn(ICON_CLASS, 'text-blue-600 dark:text-blue-400')} />,
    bg: 'bg-blue-500/10 dark:bg-blue-400/10',
  },
  WITHDRAW_RESERVE: {
    icon: <ArrowUpRight className={cn(ICON_CLASS, 'text-violet-600 dark:text-violet-400')} />,
    bg: 'bg-violet-500/10 dark:bg-violet-400/10',
  },
  WITHDRAW_FULFIL: {
    icon: <ArrowUpRight className={cn(ICON_CLASS, 'text-violet-600 dark:text-violet-400')} />,
    bg: 'bg-violet-500/10 dark:bg-violet-400/10',
  },
  WITHDRAW_CANCEL: {
    icon: <XCircle className={cn(ICON_CLASS, 'text-rose-600 dark:text-rose-400')} />,
    bg: 'bg-rose-500/10 dark:bg-rose-400/10',
  },
  REFERRAL_REWARD: {
    icon: <Gift className={cn(ICON_CLASS, 'text-fuchsia-600 dark:text-fuchsia-400')} />,
    bg: 'bg-fuchsia-500/10 dark:bg-fuchsia-400/10',
  },
  PARTNER_FEE: {
    icon: <Handshake className={cn(ICON_CLASS, 'text-sky-600 dark:text-sky-400')} />,
    bg: 'bg-sky-500/10 dark:bg-sky-400/10',
  },
  PARTNER_TRADE_SHARE: {
    icon: <Handshake className={cn(ICON_CLASS, 'text-sky-600 dark:text-sky-400')} />,
    bg: 'bg-sky-500/10 dark:bg-sky-400/10',
  },
  PARTNER_MONTHLY: {
    icon: <Handshake className={cn(ICON_CLASS, 'text-sky-600 dark:text-sky-400')} />,
    bg: 'bg-sky-500/10 dark:bg-sky-400/10',
  },
  PARTNER_POST_HOLD: {
    icon: <Lock className={cn(ICON_CLASS, 'text-amber-600 dark:text-amber-400')} />,
    bg: 'bg-amber-500/10 dark:bg-amber-400/10',
  },
  PARTNER_POST_REFUND: {
    icon: <RotateCcw className={cn(ICON_CLASS, 'text-blue-600 dark:text-blue-400')} />,
    bg: 'bg-blue-500/10 dark:bg-blue-400/10',
  },
  ADJUSTMENT: {
    icon: <ShieldAlert className={cn(ICON_CLASS, 'text-primary')} />,
    bg: 'bg-primary/10',
  },
};

function getTransactionIcon(kind: TransactionKind, incoming: boolean): TxIcon {
  // Ikki tomonli turlar: kim o'qiyotganiga qarab ikon ham o'zgaradi.
  if (kind === 'PARTNER_POST_SETTLE') {
    return incoming
      ? {
          icon: <Handshake className={cn(ICON_CLASS, 'text-sky-600 dark:text-sky-400')} />,
          bg: 'bg-sky-500/10 dark:bg-sky-400/10',
        }
      : {
          icon: <Megaphone className={cn(ICON_CLASS, 'text-indigo-600 dark:text-indigo-400')} />,
          bg: 'bg-indigo-500/10 dark:bg-indigo-400/10',
        };
  }
  if (kind === 'TRADE_SETTLE') {
    return incoming
      ? {
          icon: <CheckCircle2 className={cn(ICON_CLASS, 'text-emerald-600 dark:text-emerald-400')} />,
          bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
        }
      : {
          icon: <ArrowUpRight className={cn(ICON_CLASS, 'text-muted-foreground')} />,
          bg: 'bg-muted',
        };
  }
  const known = KIND_ICONS[kind];
  if (known) return known;

  return {
    icon: incoming ? (
      <ArrowDownLeft className={cn(ICON_CLASS, 'text-emerald-600 dark:text-emerald-400')} />
    ) : (
      <ArrowLeftRight className={cn(ICON_CLASS, 'text-muted-foreground')} />
    ),
    bg: incoming ? 'bg-emerald-500/10 dark:bg-emerald-400/10' : 'bg-muted',
  };
}

export function WalletView({
  wallet,
  initialInvoice,
  initialHistory,
  history: legacyHistory,
  telegramUsername,
  topUpAmount,
  returnTo,
}: WalletViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<WalletTab>('topup');
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(initialInvoice);
  const [entries, setEntries] = useState<WalletEntryResponse[] | null>(
    initialHistory ?? legacyHistory ?? null,
  );
  const [loadingHistory, setLoadingHistory] = useState(
    initialHistory === undefined && legacyHistory === undefined,
  );
  const [filter, setFilter] = useState<HistoryFilter>('all');
  /** Set when a watched transfer lands, so the page can say what happened. */
  const [creditedTiyin, setCreditedTiyin] = useState<number | null>(null);

  /**
   * Only while there is a transfer to wait for. A deposit cannot arrive
   * without an invoice, so an idle wallet page asks nothing at all.
   */
  useInvoiceWatch({
    invoiceId: invoice?.id ?? null,
    onPaid: useCallback((credited: number) => {
      setCreditedTiyin(credited);
      setInvoice(null);
      setActiveTab('topup');
      // The balance and the history are server-rendered; this is what moves
      // them. The receipt above does not wait for it.
      router.refresh();
    }, [router]),
  });

  useEffect(() => {
    let active = true;
    if (initialHistory === undefined && legacyHistory === undefined) {
      setLoadingHistory(true);
      getWalletHistory()
        .then((data) => {
          if (active) {
            setEntries(data ?? []);
            setLoadingHistory(false);
          }
        })
        .catch(() => {
          if (active) {
            setEntries([]);
            setLoadingHistory(false);
          }
        });
    }
    return () => {
      active = false;
    };
  }, [initialHistory, legacyHistory]);

  const rows = useMemo(() => (entries ? walletHistoryRows(entries) : []), [entries]);

  const filteredRows = useMemo(() => {
    if (filter === 'in') return rows.filter((r) => r.incoming);
    if (filter === 'out') return rows.filter((r) => !r.incoming);
    return rows;
  }, [rows, filter]);

  const handleCreated = useCallback((created: InvoiceResponse) => {
    setInvoice(created);
    setActiveTab('topup');
    // A second top-up must not sit under the previous one's receipt.
    setCreditedTiyin(null);
  }, []);

  const handleExpired = useCallback(() => {
    router.refresh();
  }, [router]);

  const handleDismissed = useCallback(() => {
    setInvoice(null);
  }, []);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4 sm:space-y-5">
      {/* 1. Hero Balance Card */}
      <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs sm:p-7">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
            <WalletIcon className="h-3.5 w-3.5 text-primary" />
            Mavjud balans
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Hamyon
          </span>
        </div>

        <div className="mt-2.5">
          <p className="text-3xl font-black tracking-tight tabular-nums text-foreground sm:text-4xl">
            {formatTiyin(wallet.availableTiyin)}{' '}
            <span className="text-xl font-semibold text-muted-foreground sm:text-2xl">
              so‘m
            </span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Ishlatish mumkin bo‘lgan mablag‘
          </p>
        </div>



        {(wallet.heldTiyin > 0 || wallet.withdrawPendingTiyin > 0) && (
          <div className="mt-4 space-y-2 border-t border-border/60 pt-3.5">
            {wallet.heldTiyin > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-amber-500/10 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-amber-900 dark:text-amber-200">
                  <Snowflake className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  <span>Savdoda muzlatilgan — savdo yakunlangach ochiladi</span>
                </div>
                <span className="font-bold tabular-nums text-amber-900 dark:text-amber-200">
                  {formatTiyin(wallet.heldTiyin)} so‘m
                </span>
              </div>
            )}
            {wallet.withdrawPendingTiyin > 0 && (
              <div className="flex items-center justify-between rounded-xl bg-blue-500/10 px-3.5 py-2.5 text-xs">
                <div className="flex items-center gap-2 text-blue-900 dark:text-blue-200">
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>Yechish jarayonida</span>
                </div>
                <span className="font-bold tabular-nums text-blue-900 dark:text-blue-200">
                  {formatTiyin(wallet.withdrawPendingTiyin)} so‘m
                </span>
              </div>
            )}
          </div>
        )}

        {/* 3 Quick Action Buttons */}
        <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border/60 pt-4">
          <Button
            type="button"
            variant={activeTab === 'topup' ? 'default' : 'outline'}
            onClick={() => setActiveTab('topup')}
            className={cn(
              'h-11 rounded-xl text-xs sm:text-sm font-semibold transition active:scale-95 flex items-center justify-center gap-1.5',
              activeTab !== 'topup' && 'border-border/80 text-foreground hover:bg-muted/50',
            )}
          >
            <ArrowDownToLine className="h-4 w-4" />
            To‘ldirish
          </Button>

          <Button
            type="button"
            variant={activeTab === 'withdraw' ? 'default' : 'outline'}
            onClick={() => setActiveTab('withdraw')}
            className={cn(
              'h-11 rounded-xl text-xs sm:text-sm font-semibold transition active:scale-95 flex items-center justify-center gap-1.5',
              activeTab !== 'withdraw' && 'border-border/80 text-foreground hover:bg-muted/50',
            )}
          >
            <ArrowUpFromLine className="h-4 w-4" />
            Pul yechish
          </Button>

          <Button
            type="button"
            variant={activeTab === 'history' ? 'default' : 'outline'}
            onClick={() => setActiveTab('history')}
            className={cn(
              'h-11 rounded-xl text-xs sm:text-sm font-semibold transition active:scale-95 flex items-center justify-center gap-1.5',
              activeTab !== 'history' && 'border-border/80 text-foreground hover:bg-muted/50',
            )}
          >
            <History className="h-4 w-4" />
            Tarix
            {rows.length > 0 && (
              <span
                className={cn(
                  'ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                  activeTab === 'history'
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {rows.length}
              </span>
            )}
          </Button>
        </div>
      </section>

      {/* 2. Active Tab Content: Top-up */}
      {activeTab === 'topup' && (
        invoice ? (
          <InvoicePanel
            invoice={invoice}
            onExpired={handleExpired}
            onDismiss={handleDismissed}
          />
        ) : (
          <>
            {creditedTiyin !== null && (
              <section
                role="status"
                className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 shadow-xs sm:p-6"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <div>
                    <h2 className="text-base font-bold text-foreground">
                      To&lsquo;lov qabul qilindi
                    </h2>
                    <p className="mt-1 text-sm text-foreground">
                      Hamyoningizga{' '}
                      <strong className="tabular-nums">
                        {formatTiyin(creditedTiyin)} so&lsquo;m
                      </strong>{' '}
                      tushdi.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCreditedTiyin(null)}
                  className="mt-4 min-h-11 w-full rounded-xl font-semibold sm:w-auto"
                >
                  Yopish
                </Button>
              </section>
            )}
            <TopUpForm onCreated={handleCreated} initialAmount={topUpAmount} />
          </>
        )
      )}

      {/* 3. Active Tab Content: Withdraw */}
      {activeTab === 'withdraw' && (
        <WithdrawForm
          availableTiyin={wallet.availableTiyin}
          telegramUsername={telegramUsername}
          defaultOpen={true}
          onCreated={() => {
            router.refresh();
            setActiveTab('history');
          }}
        />
      )}

      {/* 4. Active Tab Content: History */}
      {activeTab === 'history' && (
        <section className="overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-xs sm:p-7">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-4">
            <h2 className="text-base font-bold text-foreground sm:text-lg">Amaliyotlar</h2>

            {rows.length > 0 && (
              <div className="flex items-center gap-1 rounded-xl bg-muted/60 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setFilter('all')}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold transition active:scale-95',
                    filter === 'all'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Barchasi ({rows.length})
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('in')}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold transition active:scale-95',
                    filter === 'in'
                      ? 'bg-card text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Kirim
                </button>
                <button
                  type="button"
                  onClick={() => setFilter('out')}
                  className={cn(
                    'rounded-lg px-2.5 py-1 font-semibold transition active:scale-95',
                    filter === 'out'
                      ? 'bg-card text-foreground shadow-2xs'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  Chiqim
                </button>
              </div>
            )}
          </div>

          {loadingHistory ? (
            <div className="space-y-3 py-3 animate-pulse">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-xl bg-muted" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-24 rounded bg-muted" />
                      <div className="h-2.5 w-16 rounded bg-muted/60" />
                    </div>
                  </div>
                  <div className="h-4 w-16 rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-foreground">
                Hozircha amaliyot yo‘q.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Barcha o‘tkazmalar va savdo amaliyotlari shu yerda ko‘rinadi.
              </p>
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-xs sm:text-sm text-muted-foreground">
                Ushbu filtr bo‘yicha amaliyot topilmadi.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {filteredRows.map((row, index) => {
                const { icon, bg } = getTransactionIcon(row.kind, row.incoming);

                return (
                  <li
                    key={`${row.transactionId}-${index}`}
                    className="flex items-center justify-between gap-3 py-3.5 first:pt-3.5 last:pb-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', bg)}>
                        {icon}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{row.label}</p>
                        <p className="text-xs text-muted-foreground">{row.when}</p>
                        <details className="mt-1 text-xs text-muted-foreground">
                          <summary className="min-h-11 cursor-pointer py-3">Amaliyot raqami</summary>
                          <p className="select-all break-all font-mono">{row.transactionId}</p>
                        </details>
                        {row.tradeHref && <Link href={row.tradeHref} prefetch={false} className="inline-flex min-h-11 items-center font-semibold text-primary underline">Savdoni ochish</Link>}
                      </div>
                    </div>
                    <span
                      className={cn(
                        'flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums',
                        row.movement === 'in' && 'text-emerald-600 dark:text-emerald-400',
                        row.movement === 'out' && 'text-foreground',
                        // Muted and signless: the owner still has this money, it
                        // just moved between their own piles.
                        row.movement === 'internal' && 'text-muted-foreground',
                      )}
                    >
                      {row.movement === 'internal' && (
                        <Snowflake className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {row.amount}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

        <GrowthLink href="/invite" event="invite_open" placement="wallet"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-primary dark:text-secondary transition hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Gift aria-hidden className="h-4 w-4" /> Do‘st taklif qilish va mukofotlar
        </GrowthLink>

      <TipCallout
        variant="info"
        dismissible
        dismissKey="wallet_info_callout"
        learnMoreHref="/help#wallet"
        learnMoreLabel="Hamyon qo‘llanmasi"
        className="mt-2"
      >
        Balans to‘lov tasdiqlangach yangilanadi. Pul yechish so‘rovlari odatda 15–60 daqiqada ko‘rib chiqiladi; bu muddat kafolatlanmaydi. Amaliyot raqamini tarixdan topishingiz mumkin.
      </TipCallout>
    </div>
  );
}
