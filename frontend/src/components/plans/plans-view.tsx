'use client';

import * as Dialog from '@radix-ui/react-dialog';
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
  formatPlanDate,
  PLAN_NAMES,
  planAction,
  planEndDate,
  type PlanAction,
  yearlySavingsPercent,
  type MyPlan,
  type PlanCatalogItem,
  type PlanCode,
  type PlanPeriod,
} from '@/lib/plans';
import { PlanPurchaseError, purchasePlan } from '@/lib/plans-client';
import { shortfallTiyin, topUpHref } from '@/lib/wallet-shortfall';

import { PlanCard, type CardAction } from './plan-card';

interface PlansViewProps {
  catalog: PlanCatalogItem[];
  /** null when signed out or the lookup failed. */
  mine: MyPlan | null;
  signedIn: boolean;
}

interface Confirm {
  item: PlanCatalogItem;
  period: PlanPeriod;
  action: PlanAction;
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
  // Signed in but the lookup failed: never guess FREE, or an active
  // subscriber is offered "Tanlash" and a paid-for plan is bought twice.
  const planUnknown = signedIn && mine === null;
  const me = mine ?? FREE;
  const now = new Date();
  const maxSaving = Math.max(0, ...plans.map((p) => yearlySavingsPercent(p.prices) ?? 0));
  const middlePaid = plans.filter((p) => Object.keys(p.prices).length > 0)[0];
  const featuredCode = plans.filter((p) => Object.keys(p.prices).length > 0)[1]?.code ?? middlePaid?.code;
  const currentName = PLAN_NAMES[me.code];

  async function run(item: PlanCatalogItem, per: PlanPeriod, action: PlanAction) {
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
        setConfirm({
          item: { ...item, prices: { ...item.prices, [per]: detail.currentPriceTiyin } },
          period: per,
          action,
          priceChanged: true,
        });
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
        toast.error(
          e instanceof PlanPurchaseError
            ? e.message
            : 'So‘rov bajarilmadi. Qayta urinib ko‘ring',
        );
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
    if (action === 'upgrade') setConfirm({ item, period, action, priceChanged: false });
    else if (action === 'choose' || action === 'extend') void run(item, period, action);
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

      {planUnknown && (
        <div role="alert" className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted p-4 text-sm">
          <span>Joriy tarifingizni aniqlab bo‘lmadi.</span>
          <Button type="button" size="sm" onClick={() => router.refresh()}>
            Qayta urinish
          </Button>
        </div>
      )}

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
          const cardAction = (it: PlanCatalogItem, a: PlanAction): CardAction =>
            planUnknown ? 'unknown' : !signedIn ? (it.code === 'STANDARD' ? 'free-anon' : 'choose') : a;
          return (
            <PlanCard
              key={item.code}
              item={item}
              period={period}
              action={cardAction(item, action)}
              isCurrent={signedIn && !planUnknown && me.code === item.code}
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
          onCancel={() => {
            if (busy === null) setConfirm(null);
          }}
          onConfirm={() => void run(confirm.item, confirm.period, confirm.action)}
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
  const { item, period, action, priceChanged } = confirm;
  const price = item.prices[period] ?? 0;
  const name = PLAN_NAMES[item.code];
  const left = daysLeft(mine.expiresAt, now);
  const burns = action === 'upgrade' && left !== null && left > 0;
  const periodLabel = period === 'YEAR' ? '1 yil' : '1 oy';
  const title =
    action === 'upgrade' ? `${name}’ga o‘tasizmi?`
    : action === 'extend' ? `${name} tarifini uzaytirasizmi?`
    : `${name} tarifini tanlaysizmi?`;
  const cta = action === 'upgrade' ? 'Oshirish' : action === 'extend' ? 'Uzaytirish' : 'Tanlash';
  const ends = formatPlanDate(planEndDate(action, mine, period, now));
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-foreground/45" />
        <Dialog.Content
          onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
          onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
          className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-card p-6 text-card-foreground shadow-xl"
        >
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-secondary/25 text-secondary-foreground dark:text-secondary">
              <ArrowUp className="size-5" aria-hidden />
            </span>
            <Dialog.Title className="text-lg font-extrabold">{title}</Dialog.Title>
          </div>
          <Dialog.Description className={priceChanged ? 'text-sm font-semibold' : 'sr-only'}>
            {priceChanged
              ? `Narx o‘zgardi: ${formatTiyin(price)} so‘m. Davom etasizmi?`
              : 'Tarif tafsilotlari va tasdiqlash'}
          </Dialog.Description>
          <dl className="flex flex-col gap-2.5 rounded-xl border border-border bg-muted/50 p-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Yangi tarif</dt>
              <dd className="font-bold">{name} · {periodLabel}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Hamyondan yechiladi</dt>
              <dd className="font-bold">{formatTiyin(price)} so‘m</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">Amal qiladi (taxminan)</dt>
              <dd className="font-bold">{ends} gacha</dd>
            </div>
          </dl>
          {action === 'extend' && mine.expiresAt && (
            <p className="text-sm text-muted-foreground">
              Muddat {formatPlanDate(mine.expiresAt)} dan yana {periodLabel} uzayadi.
            </p>
          )}
          {burns && (
            <p className="flex items-start gap-2.5 text-sm text-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
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
              {busy ? 'Kuting…' : cta}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
