'use client';

import { Check } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatTiyin } from '@/lib/money';
import {
  CUSTOM_SLOTS_KEY,
  PLAN_NAMES,
  SLOTS_KEY,
  slotCount,
  formatPlanDate,
  yearlySavingsPercent,
  type PlanAction,
  type PlanCatalogItem,
  type PlanPeriod,
} from '@/lib/plans';
import { cn } from '@/lib/utils';

const TAGLINES: Record<PlanCatalogItem['code'], string> = {
  STANDARD: 'Boshlash uchun yetarli',
  PRO: 'Faol sotuvchilar uchun',
  MAX: 'Katta savdo, keng imkoniyat',
};

export type CardAction = PlanAction | 'free-anon' | 'unknown';

const CTA: Record<CardAction, string> = {
  'free-anon': 'Bepul',
  unknown: 'Tarif aniqlanmadi',
  choose: 'Tanlash',
  extend: 'Uzaytirish',
  upgrade: 'Oshirish',
  unavailable: 'Joriy tarif tugagach',
  'current-free': 'Joriy tarif',
  'unlimited-current': 'Muddatsiz faol',
};

interface PlanCardProps {
  item: PlanCatalogItem;
  period: PlanPeriod;
  action: CardAction;
  isCurrent: boolean;
  expiresAt: string | null;
  busy: boolean;
  /** The "most chosen" card: the middle paid plan. */
  featured?: boolean;
  onSelect: () => void;
}

export function PlanCard({
  item, period, action, isCurrent, expiresAt, busy, featured = false, onSelect,
}: PlanCardProps) {
  const free = item.code === 'STANDARD';
  const price = item.prices[period];
  const saving = period === 'YEAR' ? yearlySavingsPercent(item.prices) : null;
  const monthly = period === 'YEAR' && item.prices.YEAR ? Math.round(item.prices.YEAR / 12) : null;
  const slots = slotCount(item.entitlements, SLOTS_KEY);
  const custom = slotCount(item.entitlements, CUSTOM_SLOTS_KEY);
  const disabled = busy || action === 'unavailable' || action === 'current-free' || action === 'unlimited-current' || action === 'unknown';

  const features = [
    slots === null ? 'Cheksiz pochta qutisi' : `${slots} ta pochta qutisi`,
    ...(custom === null
      ? ['Cheksiz shaxsiy pochta']
      : custom > 0
        ? [`${custom} ta shaxsiy pochta`]
        : []),
    free ? 'Har savdoga yangi quti' : 'Qulflangan qutilar darhol ochiladi',
  ];

  const note = isCurrent && !free && expiresAt
    ? `${formatPlanDate(expiresAt)} gacha`
    : free ? 'Muddatsiz · bepul' : 'Hamyondan yechiladi';

  return (
    <article
      className={cn(
        'relative flex flex-col gap-5 rounded-2xl border p-6 sm:p-7',
        featured
          ? 'border-2 border-primary bg-primary text-white shadow-lg'
          : 'border-border bg-card text-card-foreground',
      )}
    >
      {featured && (
        <span className="absolute -top-3 left-7 rounded-full bg-secondary px-3 py-1 text-xs font-extrabold text-secondary-foreground">
          Ko‘p tanlanadi
        </span>
      )}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-extrabold">{PLAN_NAMES[item.code]}</h2>
          {saving !== null && (
            <span
              className={cn(
                'rounded-full px-2.5 py-1 text-xs font-bold',
                featured
                  ? 'bg-secondary text-secondary-foreground'
                  : 'bg-secondary/20 text-secondary-foreground dark:text-secondary',
              )}
            >
              −{saving}%
            </span>
          )}
        </div>
        <p className={cn('text-sm', featured ? 'text-white/75' : 'text-muted-foreground')}>
          {TAGLINES[item.code]}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className="text-4xl font-extrabold tracking-tight">
            {free || price === undefined ? 'Bepul' : formatTiyin(price)}
          </span>
          {!free && price !== undefined && (
            <span className={cn('text-sm font-semibold', featured ? 'text-white/75' : 'text-muted-foreground')}>
              {period === 'YEAR' ? 'so‘m / yil' : 'so‘m / oy'}
            </span>
          )}
        </div>
        <span className={cn('min-h-[1.125rem] text-xs', featured ? 'text-white/75' : 'text-muted-foreground')}>
          {monthly !== null ? `oyiga ~${formatTiyin(monthly)} so‘m` : ''}
        </span>
      </div>

      <ul className="flex flex-col gap-3 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2.5">
            <span
              className={cn(
                'grid size-5 shrink-0 place-items-center rounded-full',
                featured ? 'bg-secondary/20 text-secondary' : 'bg-primary/10 text-primary',
              )}
            >
              <Check className="size-3" strokeWidth={3} aria-hidden />
            </span>
            {f}
          </li>
        ))}
      </ul>

      <div className="mt-auto flex flex-col gap-2">
        {action !== 'free-anon' && (
        <Button
          type="button"
          size="lg"
          disabled={disabled}
          onClick={onSelect}
          variant={disabled ? 'outline' : featured ? 'secondary' : 'default'}
          className={cn('w-full', disabled && featured && 'border-white/30 bg-transparent text-white/80 hover:bg-transparent')}
        >
          {busy ? 'Kuting…' : CTA[action]}
        </Button>
        )}
        <span className={cn('min-h-[1.125rem] text-center text-xs', featured ? 'text-white/75' : 'text-muted-foreground')}>
          {note}
        </span>
      </div>
    </article>
  );
}
