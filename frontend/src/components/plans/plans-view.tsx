'use client';

import { ArrowUp, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { formatTiyin } from '@/lib/money';
import { getWallet } from '@/lib/payment-client';
import {
  daysLeft,
  PLAN_NAMES,
  planAction,
  yearlySavingsPercent,
  type MyPlan,
  type PlanCatalogItem,
  type PlanCode,
  type PlanPeriod,
} from '@/lib/plans';
import { PlanPurchaseError, purchasePlan } from '@/lib/plans-client';
import { shortfallTiyin, topUpHref } from '@/lib/wallet-shortfall';

import { PlanCard } from './plan-card';

interface PlansViewProps {
  catalog: PlanCatalogItem[];
  /** null when signed out or the lookup failed. */
  mine: MyPlan | null;
  signedIn: boolean;
}

interface Confirm {
  item: PlanCatalogItem;
  period: PlanPeriod;
  /** Set when the server quoted a different price than the card showed. */
  priceChanged: boolean;
}

const FREE: MyPlan = { code: 'STANDARD', expiresAt: null, entitlements: {} };

export function PlansView({ catalog, mine, signedIn }: PlansViewProps) {
  const router = useRouter();
  const [period, setPeriod] = useState<PlanPeriod>('MONTH');
  const [busy, setBusy] = useState<PlanCode | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [topUp, setTopUp] = useState<{ href: string; message: string } | null>(null);
  // Prices the server corrected us on, layered over the SSR catalog.
  const [prices, setPrices] = useState<Partial<Record<PlanCode, PlanCatalogItem['prices']>>>({});
  // One key per (plan, period, price) attempt: a retry or double-click reuses
  // it so the server charges once.
  const attempt = useRef<{ sig: string; key: string } | null>(null);

  const plans = [...catalog]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ ...p, prices: prices[p.code] ?? p.prices }));
  const me = mine ?? FREE;
  const now = new Date();
  const maxSaving = Math.max(0, ...plans.map((p) => yearlySavingsPercent(p.prices) ?? 0));
  const middlePaid = plans.filter((p) => Object.keys(p.prices).length > 0)[0];
  const featuredCode = plans.filter((p) => Object.keys(p.prices).length > 0)[1]?.code ?? middlePaid?.code;
  const currentName = PLAN_NAMES[me.code];

  async function run(item: PlanCatalogItem, per: PlanPeriod) {
    const price = item.prices[per];
    if (price === undefined) return;
    const sig = `${item.code}:${per}:${price}`;
    if (attempt.current?.sig !== sig) {
      attempt.current = { sig, key: crypto.randomUUID() };
    }
    setBusy(item.code);
    setTopUp(null);
    try {
      await purchasePlan({
        planCode: item.code,
        period: per,
        expectedPriceTiyin: price,
        idempotencyKey: attempt.current.key,
      });
      attempt.current = null;
      setConfirm(null);
      toast.success(`${PLAN_NAMES[item.code]} tarifi faollashdi`);
      router.refresh();
    } catch (e) {
      const detail = e instanceof PlanPurchaseError ? e.detail : null;
      if (detail?.kind === 'price_changed') {
        setPrices((prev) => ({
          ...prev,
          [item.code]: { ...item.prices, [per]: detail.currentPriceTiyin },
        }));
        setConfirm({ item: { ...item, prices: { ...item.prices, [per]: detail.currentPriceTiyin } }, period: per, priceChanged: true });
      } else if (detail?.kind === 'insufficient') {
        setConfirm(null);
        let message = detail.message;
        let href = topUpHref(0, '/plans');
        try {
          const wallet = await getWallet();
          const missing = shortfallTiyin(price, wallet.availableTiyin);
          if (missing > 0) {
            href = topUpHref(missing, '/plans');
            message = `Hamyonda mablag‘ yetarli emas — ${formatTiyin(missing * 100)} so‘m yetishmayapti`;
          }
        } catch {
          // Fall back to the server's own wording.
        }
        setTopUp({ href, message });
      } else {
        setConfirm(null);
        toast.error(e instanceof Error ? e.message : 'So‘rov bajarilmadi');
      }
    } finally {
      setBusy(null);
    }
  }

  function select(item: PlanCatalogItem) {
    if (!signedIn) {
      router.push('/auth/login?from=/plans');
      return;
    }
    const action = planAction(item, me, plans, now);
    if (action === 'upgrade') setConfirm({ item, period, priceChanged: false });
    else if (action === 'choose' || action === 'extend') void run(item, period);
  }

  return (
    <div className="mx-auto max-w-5xl px-1 py-6 sm:py-10">
      <div className="flex flex-col items-center gap-3 text-center">
        {signedIn && (
          <span className="rounded-full bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary dark:text-foreground">
            Hozir: {currentName}
          </span>
        )}
        <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">
          Ko‘proq pochta qutisi — ko‘proq savdo
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground sm:text-base">
          Har bir savdo uchun xavfsiz pochta qutisi beriladi. Tarifingiz nechta quti bir vaqtda ochiq turishini belgilaydi.
        </p>
        <div
          role="group"
          aria-label="To‘lov davri"
          className="mt-2 inline-flex rounded-full border border-border bg-card p-1"
        >
          {(['MONTH', 'YEAR'] as const).map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={
                'inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors ' +
                (period === p ? 'bg-primary text-white' : 'text-muted-foreground')
              }
            >
              {p === 'MONTH' ? 'Oylik' : 'Yillik'}
              {p === 'YEAR' && maxSaving > 0 && (
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-bold text-secondary-foreground">
                  −{maxSaving}% gacha
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {topUp && (
        <div role="alert" className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm">
          <span>{topUp.message}</span>
          <Button asChild size="sm">
            <Link href={topUp.href}>Hamyonni to‘ldirish</Link>
          </Button>
        </div>
      )}

      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((item) => {
          const action = planAction(item, me, plans, now);
          return (
            <PlanCard
              key={item.code}
              item={item}
              period={period}
              action={signedIn ? action : item.code === 'STANDARD' ? 'current-free' : 'choose'}
              isCurrent={signedIn && me.code === item.code}
              expiresAt={me.code === item.code ? me.expiresAt : null}
              busy={busy === item.code}
              featured={item.code === featuredCode}
              onSelect={() => select(item)}
            />
          );
        })}
      </div>

      <p className="mx-auto mt-9 max-w-xl text-center text-sm text-muted-foreground">
        To‘lov hamyon balansidan yechiladi. Tarif tugasa qutilar o‘chirilmaydi — limitdan ortiqlari qulflanadi va tarifni uzaytirganingizda yana ochiladi.
      </p>

      {confirm && (
        <UpgradeConfirm
          confirm={confirm}
          mine={me}
          busy={busy !== null}
          now={now}
          onCancel={() => setConfirm(null)}
          onConfirm={() => void run(confirm.item, confirm.period)}
        />
      )}
    </div>
  );
}

function UpgradeConfirm({
  confirm, mine, busy, now, onCancel, onConfirm,
}: {
  confirm: Confirm;
  mine: MyPlan;
  busy: boolean;
  now: Date;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { item, period, priceChanged } = confirm;
  const price = item.prices[period] ?? 0;
  const left = daysLeft(mine.expiresAt, now);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/45 p-4" onClick={onCancel}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="up-title"
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-secondary/25 text-secondary-foreground dark:text-secondary">
            <ArrowUp className="size-5" aria-hidden />
          </span>
          <h2 id="up-title" className="text-lg font-extrabold">
            {PLAN_NAMES[item.code]}’ga o‘tasizmi?
          </h2>
        </div>
        {priceChanged && (
          <p role="status" className="text-sm font-semibold">
            Narx o‘zgardi: {formatTiyin(price)} so‘m. Davom etasizmi?
          </p>
        )}
        <dl className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/50 p-4 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Yangi tarif</dt>
            <dd className="font-bold">{PLAN_NAMES[item.code]} · {period === 'YEAR' ? '1 yil' : '1 oy'}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Hamyondan yechiladi</dt>
            <dd className="font-bold">{formatTiyin(price)} so‘m</dd>
          </div>
        </dl>
        {left !== null && (
          <p className="flex items-start gap-2.5 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Joriy {PLAN_NAMES[mine.code]} tarifining qolgan {left} kuni kuyadi. Yangi tarif bugundan boshlanadi.
            </span>
          </p>
        )}
        <div className="grid grid-cols-2 gap-2.5">
          <Button type="button" variant="outline" size="lg" onClick={onCancel} disabled={busy}>
            Bekor qilish
          </Button>
          <Button type="button" size="lg" onClick={onConfirm} disabled={busy}>
            {busy ? 'Kuting…' : 'Oshirish'}
          </Button>
        </div>
      </div>
    </div>
  );
}
