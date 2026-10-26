'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { ArrowUp, ArrowUpRight, RefreshCw, TriangleAlert, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { usePlanNow } from '@/hooks/use-plan-now';
import { Button } from '@/components/ui/button';
import { formatTiyin } from '@/lib/money';
import { getWallet } from '@/lib/payment-client';
import {
  daysLeft,
  membershipState,
  expiredPlanName,
  mailboxCapacity,
  formatPlanDate,
  PLAN_NAMES,
  planAction,
  STAFF_UNLIMITED_MESSAGE,
  planEndDate,
  type PlanAction,
  type MyPlan,
  type PlanCatalogItem,
  type PlanCode,
  type PlanPeriod,
} from '@/lib/plans';
import { PlanPurchaseError, purchasePlan } from '@/lib/plans-client';
import { shortfallTiyin, topUpHref } from '@/lib/wallet-shortfall';

import { PlanCard, type CardAction } from './plan-card';
import { PlanComparison } from './plan-comparison';
import { PlansFaq } from './plans-faq';
import styles from './plans.module.css';

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
  const period: PlanPeriod = 'MONTH';
  const [accepted, setAccepted] = useState(false);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState<PlanCode | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);
  const [topUp, setTopUp] = useState<{ href: string; message: string; shortfallSom?: number } | null>(null);
  // Prices the server corrected us on, layered over the SSR catalog.
  const [prices, setPrices] = useState<Partial<Record<PlanCode, PlanCatalogItem['prices']>>>({});
  // One key per (plan, period, price) attempt: a retry or double-click reuses
  // it so the server charges once.
  const attempt = useRef<{ sig: string; key: string } | null>(null);

  const plans = catalog.filter((p) => p.code === 'STANDARD' || p.code === 'PRO')
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((p) => ({ ...p, prices: prices[p.code] ?? p.prices }));
  // Signed in but the lookup failed: never guess FREE, or an active
  // subscriber is offered "Tanlash" and a paid-for plan is bought twice.
  const now = usePlanNow(mine);
  const state = membershipState(mine, now);
  const planUnknown = signedIn && state === 'unknown';
  const me = mine ?? FREE;

  const currentName = ['expired', 'grace', 'recovery'].includes(state) ? `Free · ${expiredPlanName(me)} muddati tugagan` : PLAN_NAMES[me.code];
  const currentLive = state === 'active' || state === 'unlimited' || state === 'staff' || state === 'free';

  async function run(item: PlanCatalogItem, per: PlanPeriod, action: PlanAction) {
    const current = plans.find((p) => p.code === item.code);
    if (!current || !mailboxCapacity(current.entitlements) || !mailboxCapacity(item.entitlements)) {
      setConfirm(null);
      toast.error('Pochta limiti aniqlanmadi');
      return;
    }
    const currentAction = planAction(current, me, plans, new Date());
    if (!signedIn || planUnknown || currentAction !== action || !['choose', 'extend', 'upgrade'].includes(currentAction)) {
      setConfirm(null);
      toast.error('Tarif holati o‘zgardi. Qayta tekshiring.');
      return;
    }
    const price = item.prices[per];
    if (price === undefined || item.code !== 'PRO' || per !== 'MONTH' || inFlight.current || accepted) return;
    inFlight.current = true;
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
      setAccepted(true);
      toast.success('Xarid qabul qilindi. Pro imkoniyatlari faollashtirilmoqda.');
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
        const message = detail.message;
        let missingSom: number | undefined;
        let href = topUpHref(0, '/plans?intent=pro#pro');
        try {
          const wallet = await getWallet();
          const missing = shortfallTiyin(price, wallet.availableTiyin);
          if (missing > 0) {
            missingSom = missing;
            href = topUpHref(missing, '/plans?intent=pro#pro');
          }
        } catch {
          // Fall back to the server's own wording.
        }
        setTopUp({ href, message, shortfallSom: missingSom });
      } else {
        setConfirm(null);
        toast.error(
          e instanceof PlanPurchaseError
            ? e.message
            : 'So‘rov bajarilmadi. Qayta urinib ko‘ring',
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(null);
    }
  }

  function select(item: PlanCatalogItem) {
    if (!mailboxCapacity(item.entitlements)) return;
    if (!signedIn) {
      router.push('/auth/login?from=' + encodeURIComponent('/plans?intent=pro#pro'));
      return;
    }
    if (planUnknown || accepted || inFlight.current) return;
    const action = planAction(item, me, plans, now);
    if (action === 'upgrade' || action === 'choose' || action === 'extend') {
      setConfirm({ item, period, action, priceChanged: false });
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.pageTopline}>
        <Link href="/profile" className={styles.discoverLink}>Profil <ArrowUpRight size={14} aria-hidden /></Link>
        {signedIn && !planUnknown && <span className={styles.myPlan}><span />Hozir: {currentName}</span>}
      </div>
      <header className={styles.hero}>
        <h1>Sizga mos tarif</h1>
        <p>Kundalik foydalanish uchun Free. Faol savdo va ko‘proq imkoniyat uchun Pro.</p>
      </header>

      {plans.length === 0 && <PlansUnavailable empty />}

      {signedIn && !planUnknown && me.code === 'STAFF' && (
        <div role="status" className="mx-auto mt-6 max-w-xl rounded-xl border border-border bg-muted p-4 text-center text-sm font-semibold text-foreground">
          {STAFF_UNLIMITED_MESSAGE}
        </div>
      )}

      {planUnknown && (
        <div role="alert" className="mx-auto mt-6 flex max-w-xl flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted p-4 text-sm">
          <span>Joriy tarifingizni aniqlab bo‘lmadi.</span>
          <Button type="button" size="sm" onClick={() => router.refresh()}>
            Qayta urinish
          </Button>
        </div>
      )}

      {accepted && (
        <div role="status" className="mx-auto mt-6 max-w-xl rounded-xl border border-border bg-muted p-4 text-sm">
          Xarid qabul qilindi. Pro imkoniyatlari faollashtirilmoqda. Xizmatlarda yangilanish biroz vaqt olishi mumkin.
        </div>
      )}

      <div className={styles.cards} data-recovery={topUp !== null}>
        {plans.map((item) => {
          const action = planAction(item, me, plans, now);
          const cardAction = (it: PlanCatalogItem, a: PlanAction): CardAction =>
            accepted ? 'pending' : planUnknown ? 'unknown' : !signedIn ? (it.code === 'STANDARD' ? 'free-anon' : 'choose') : a;
          return (
            <PlanCard
              key={item.code}
              item={item}
              period={period}
              action={cardAction(item, action)}
              isCurrent={signedIn && !planUnknown && me.code === item.code && currentLive}
              expiresAt={me.code === item.code ? me.expiresAt : null}
              busy={busy === item.code}
              featured={item.code === 'PRO'}
              recovery={item.code === 'PRO' && !planUnknown && !accepted && ['choose', 'extend', 'upgrade'].includes(action) ? topUp : null}
              onSelect={() => select(item)}
            />
          );
        })}
      </div>

      {plans.length > 0 && <PlanComparison catalog={plans} />}
      <p className={styles.purchaseNote}>Bir marta to‘lang, tanlangan muddat davomida foydalaning.<br />Avtomatik pul yechilmaydi.</p>
      <PlansFaq catalog={plans} />

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
  const replacesUnlimited = action === 'upgrade' && mine.code !== 'STANDARD' && mine.expiresAt === null;
  const periodLabel = period === 'YEAR' ? '1 yil' : '1 oy';
  const title =
    action === 'upgrade' ? `${name}’ga o‘tasizmi?`
    : action === 'extend' ? `${name} tarifini uzaytirasizmi?`
    : `${name} tarifini tanlaysizmi?`;
  const cta = 'Tasdiqlash';
  const ends = formatPlanDate(planEndDate(action, mine, period, now));
  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          onEscapeKeyDown={(e) => { if (busy) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (busy) e.preventDefault(); }}
          onInteractOutside={(e) => { if (busy) e.preventDefault(); }}
          className={styles.confirmDialog}
        >
          <Dialog.Close aria-label="Yopish" disabled={busy} className={styles.closeDialog}><X size={18} aria-hidden /></Dialog.Close>
          <div className="flex items-center gap-3 pr-9">
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
          {replacesUnlimited && (
            <p className="flex items-start gap-2.5 text-sm text-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
              <span>
                Muddatsiz {PLAN_NAMES[mine.code]} tarifingiz o‘rniga muddatli tarif boshlanadi.
              </span>
            </p>
          )}
          <p className="text-xs leading-relaxed text-muted-foreground">Avtomatik pul yechilmaydi. Keyingi oyda tarifni o‘zingiz uzaytirasiz. Xariddan so‘ng imkoniyatlar faollashtiriladi.</p>
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


export function PlansUnavailable({ empty = false }: { empty?: boolean }) {
  const router = useRouter();
  return <section role="alert" className={styles.unavailable}>
    <span className={styles.statusIcon}><RefreshCw size={22} aria-hidden /></span>
    <h2>{empty ? 'Tariflar hozircha mavjud emas' : 'Tariflarni yuklab bo‘lmadi'}</h2>
    <p>Narx va imkoniyatlarni hozir tekshira olmadik. Qayta urinib ko‘ring yoki yordam xizmatiga yozing.</p>
    <div><Button onClick={() => router.refresh()}>Qayta urinish</Button><Button variant="outline" asChild><Link href="/support">Yordam olish</Link></Button></div>
  </section>;
}
