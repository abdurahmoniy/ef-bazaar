'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  CheckCircle2,
  HelpCircle,
  History,
  Lock,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react';

import { InvoicePanel } from '@/components/payment/invoice-panel';
import { TopUpForm } from '@/components/payment/top-up-form';
import { getWalletHistory } from '@/lib/payment-client';
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
  initialHistory?: WalletEntryResponse[];
  history?: WalletEntryResponse[];
}

type HistoryFilter = 'all' | 'in' | 'out';

function getTransactionIcon(label: string, incoming: boolean) {
  if (label.includes("To'ldirish") || label.includes("to‘ldirish") || label.includes("To‘ldirish")) {
    return {
      icon: <ArrowDownLeft className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />,
      bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    };
  }
  if (label.includes('muzlatildi')) {
    return {
      icon: <Lock className="h-4.5 w-4.5 text-amber-600 dark:text-amber-400" />,
      bg: 'bg-amber-500/10 dark:bg-amber-400/10',
    };
  }
  if (label.includes('tushdi')) {
    return {
      icon: <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />,
      bg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    };
  }
  if (label.includes('qaytdi')) {
    return {
      icon: <RotateCcw className="h-4.5 w-4.5 text-blue-600 dark:text-blue-400" />,
      bg: 'bg-blue-500/10 dark:bg-blue-400/10',
    };
  }
  if (label.includes('Yechish') || label.includes('yechish')) {
    return {
      icon: <ArrowUpRight className="h-4.5 w-4.5 text-violet-600 dark:text-violet-400" />,
      bg: 'bg-violet-500/10 dark:bg-violet-400/10',
    };
  }
  if (label.includes('bekor')) {
    return {
      icon: <XCircle className="h-4.5 w-4.5 text-rose-600 dark:text-rose-400" />,
      bg: 'bg-rose-500/10 dark:bg-rose-400/10',
    };
  }
  if (label.includes('Admin') || label.includes('tuzatish')) {
    return {
      icon: <ShieldAlert className="h-4.5 w-4.5 text-primary" />,
      bg: 'bg-primary/10',
    };
  }
  return {
    icon: incoming ? (
      <ArrowDownLeft className="h-4.5 w-4.5 text-emerald-600 dark:text-emerald-400" />
    ) : (
      <ArrowLeftRight className="h-4.5 w-4.5 text-muted-foreground" />
    ),
    bg: incoming ? 'bg-emerald-500/10 dark:bg-emerald-400/10' : 'bg-muted',
  };
}

export function WalletView({
  wallet,
  initialInvoice,
  initialHistory,
  history: legacyHistory,
}: WalletViewProps) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<InvoiceResponse | null>(initialInvoice);
  const [entries, setEntries] = useState<WalletEntryResponse[] | null>(
    initialHistory ?? legacyHistory ?? null,
  );
  const [loadingHistory, setLoadingHistory] = useState(
    initialHistory === undefined && legacyHistory === undefined,
  );
  const [filter, setFilter] = useState<HistoryFilter>('all');

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
    <div className="mx-auto w-full max-w-5xl space-y-6">
      {/* 2-Column Responsive Layout for Desktop, Stacking on Mobile */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left / Primary Column */}
        <div className="space-y-5 lg:col-span-7">
          {/* 1. Hero Virtual Wallet Card */}
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-[#161a42] to-[#0d102b] p-6 text-white shadow-md sm:p-7 border border-primary/20 transition-all">
            {/* Ambient decorative glow */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-secondary/15 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-12 -left-12 h-56 w-56 rounded-full bg-primary/30 blur-3xl"
            />

            <div className="relative z-10">
              <div className="flex items-center justify-between gap-2">
                <h1 className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white/90 backdrop-blur-sm border border-white/10">
                  <WalletIcon className="h-3.5 w-3.5 text-secondary" aria-hidden="true" />
                  Hamyon
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Faol hisob
                </span>
              </div>

              <div className="mt-5 sm:mt-6">
                <p className="text-xs font-medium text-white/70 uppercase tracking-wider">
                  Mavjud balans
                </p>
                <p className="mt-1 text-3xl font-black tabular-nums text-white sm:text-4xl tracking-tight">
                  {formatTiyin(wallet.availableTiyin)}{' '}
                  <span className="text-2xl font-bold text-white/80 sm:text-3xl">so‘m</span>
                </p>
                <p className="mt-1 text-xs text-white/70">
                  Ishlatish mumkin bo‘lgan mablag‘
                </p>
              </div>

              {(wallet.heldTiyin > 0 || wallet.withdrawPendingTiyin > 0) && (
                <dl className="mt-5 grid gap-2.5 border-t border-white/15 pt-4 sm:grid-cols-2">
                  {wallet.heldTiyin > 0 && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-white/10 backdrop-blur-sm p-3 text-xs border border-white/10">
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
                      <div className="min-w-0">
                        <dt className="font-bold tabular-nums text-amber-200">
                          {formatTiyin(wallet.heldTiyin)} so‘m
                        </dt>
                        {/* A user who sees money they cannot spend, with no reason
                            given, opens a support ticket. */}
                        <dd className="text-white/80 text-[11.5px] mt-0.5 leading-snug">
                          Savdoda muzlatilgan — savdo yakunlangach ochiladi
                        </dd>
                      </div>
                    </div>
                  )}
                  {wallet.withdrawPendingTiyin > 0 && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-white/10 backdrop-blur-sm p-3 text-xs border border-white/10">
                      <ArrowUpRight className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" aria-hidden="true" />
                      <div className="min-w-0">
                        <dt className="font-bold tabular-nums text-blue-200">
                          {formatTiyin(wallet.withdrawPendingTiyin)} so‘m
                        </dt>
                        <dd className="text-white/80 text-[11.5px] mt-0.5 leading-snug">
                          Yechish jarayonida
                        </dd>
                      </div>
                    </div>
                  )}
                </dl>
              )}
            </div>
          </section>

          {/* 2. Top-Up Form or Active Invoice Panel */}
          {invoice ? (
            <InvoicePanel
              invoice={invoice}
              onExpired={handleExpired}
              onDismiss={handleDismissed}
            />
          ) : (
            <TopUpForm onCreated={handleCreated} />
          )}
        </div>

        {/* Right / Information Column */}
        <div className="space-y-4 lg:col-span-5">
          {/* Security & Escrow Guarantee Card */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2.5 text-foreground">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold sm:text-base">Kafolatlangan xavfsizlik</h2>
                <p className="text-xs text-muted-foreground">100% Escrow himoyasi</p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-xs sm:text-sm text-muted-foreground leading-relaxed">
              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                  1
                </span>
                <p>
                  <strong className="text-foreground font-semibold">Himoyalangan savdo:</strong>{' '}
                  Akkaunt xaridida pul sotuvchiga to‘g‘ridan-to‘g‘ri berilmaydi, faqat ma‘lumotlar
                  tekshirilib tasdiqlangach o‘tkaziladi.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                  2
                </span>
                <p>
                  <strong className="text-foreground font-semibold">0% komissiya:</strong>{' '}
                  Hamyonni bank kartangizdan to‘ldirishda ortiqcha komissiya yechilmaydi.
                </p>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-secondary/20 text-secondary-foreground text-[10px] font-bold">
                  3
                </span>
                <p>
                  <strong className="text-foreground font-semibold">Avtomatik qaytarish:</strong>{' '}
                  Savdo bekor qilingan taqdirda, muzlatilgan mablag‘ingiz zudlik bilan hamyonga
                  qaytariladi.
                </p>
              </div>
            </div>
          </div>

          {/* Quick FAQ / Helper Card */}
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
            <div className="flex items-center gap-2.5 text-foreground">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold sm:text-base">Foydali ma‘lumot</h3>
                <p className="text-xs text-muted-foreground">Ko‘p so‘raladigan savollar</p>
              </div>
            </div>

            <div className="mt-4 space-y-2.5 text-xs sm:text-sm text-muted-foreground">
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold text-foreground">Pul qachon hisobga tushadi?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Ko‘rsatilgan summani aynan o‘tkazganingizdan so‘ng, balans 1-2 daqiqada avtomatik
                  yangilanadi.
                </p>
              </div>
              <div className="rounded-xl bg-muted/40 p-3">
                <p className="font-semibold text-foreground">Savdo qanday to‘lanadi?</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  E‘lonlar bozorida «Sotib olish» tugmasini bosganingizda to‘lov hamyon balansingizdan
                  xavfsiz yechiladi.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Transaction History Section */}
      <section className="overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <History className="h-4.5 w-4.5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground sm:text-lg">Amaliyotlar</h2>
              <p className="text-xs text-muted-foreground">Barcha kirim va chiqimlar tarixi</p>
            </div>
          </div>

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
          <div className="space-y-3 py-2 animate-pulse">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center justify-between gap-3 py-2">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-muted" />
                  <div className="space-y-2">
                    <div className="h-3.5 w-28 rounded bg-muted" />
                    <div className="h-2.5 w-16 rounded bg-muted/60" />
                  </div>
                </div>
                <div className="h-4 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-muted/60 text-muted-foreground">
              <History className="h-7 w-7 opacity-50" />
            </div>
            <p className="mt-3 text-sm font-semibold text-foreground">
              Hozircha amaliyot yo‘q.
            </p>
            <p className="mt-1 text-xs text-muted-foreground max-w-xs mx-auto">
              Barcha o‘tkazmalar va savdo amaliyotlari shu yerda ko‘rinadi.
            </p>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-sm font-medium text-muted-foreground">
              Ushbu filtr bo‘yicha amaliyot topilmadi.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filteredRows.map((row, index) => {
              const { icon, bg } = getTransactionIcon(row.label, row.incoming);

              return (
                <li
                  // One row per ledger entry, and the entry id is not exposed —
                  // a transaction that posts twice to USER_AVAILABLE for one
                  // user would collide on the transaction id alone.
                  key={`${row.transactionId}-${index}`}
                  className="flex items-center justify-between gap-3 py-3.5 transition-colors hover:bg-muted/30 -mx-2 px-2 rounded-xl"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn('grid h-10 w-10 shrink-0 place-items-center rounded-xl', bg)}>
                      {icon}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-foreground">{row.label}</p>
                      <p className="text-xs font-medium text-muted-foreground mt-0.5">{row.when}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      'shrink-0 text-sm font-black tabular-nums sm:text-base',
                      row.incoming
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-foreground',
                    )}
                  >
                    {row.amount}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

