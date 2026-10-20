'use client';

import { ArrowUpRight, Check, Mail } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { formatTiyin } from '@/lib/money';
import {
  PLAN_NAMES,
  planBenefits,
  mailboxCapacity,
  formatPlanDate,
  type PlanAction,
  type PlanCatalogItem,
  type PlanPeriod,
} from '@/lib/plans';
import { cn } from '@/lib/utils';

import styles from './plans.module.css';

const TAGLINES: Record<PlanCatalogItem['code'], string> = {
  STANDARD: 'Kundalik foydalanish uchun bepul tarif.',
  PRO: 'Faol savdo va o‘zingizga xos profil uchun.',
  MAX: 'Kengroq imkoniyat. O‘zingizga xos daraja.',
  STAFF: 'Barcha imkoniyatlar siz uchun ochiq.',
};

export type CardAction = PlanAction | 'free-anon' | 'unknown' | 'pending';

const CTA: Record<CardAction, string> = {
  'free-anon': 'Bepul',
  unknown: 'Tarif aniqlanmadi',
  pending: 'Faollashtirilmoqda',
  choose: 'Pro’ga o‘tish',
  extend: 'Pro’ni uzaytirish',
  upgrade: 'Pro’ga o‘tish',
  unavailable: 'Joriy tarif tugagach',
  'current-free': 'Joriy tarif',
  'unlimited-current': 'Muddatsiz faol',
  staff: 'Admin: cheklovsiz',
};

interface PlanCardProps {
  item: PlanCatalogItem;
  period: PlanPeriod;
  action: CardAction;
  isCurrent: boolean;
  expiresAt: string | null;
  busy: boolean;
  featured?: boolean;
  onSelect: () => void;
}

export function PlanCard({
  item, period, action, isCurrent, expiresAt, busy, featured = false, onSelect,
}: PlanCardProps) {
  const free = item.code === 'STANDARD';
  const price = item.prices[period];
  const capacity = mailboxCapacity(item.entitlements);
  const slots = capacity?.total;
  const custom = capacity?.custom;
  const disabled = !capacity || busy || action === 'pending' || (price === undefined && !free) || action === 'unavailable' || action === 'current-free' || action === 'unlimited-current' || action === 'unknown' || action === 'staff';
  const features = capacity ? [
    slots === null ? 'Cheksiz jami pochta qutisi' : `${slots} ta jami pochta qutisi`,
    ...(custom === null ? ['Shundan cheksiz yangi shaxsiy email'] : custom !== undefined && custom > 0 ? [`Shundan ${custom} ta yangi shaxsiy email`] : []),
    ...planBenefits(item).filter(f => !f.startsWith('Mos yangilik') && !f.startsWith('Kuzatuvlardan')).slice(0, 3),
  ] : ['Pochta limiti aniqlanmadi'];
  const note = isCurrent && !free && expiresAt
    ? `${formatPlanDate(expiresAt)} gacha${new Date(expiresAt).getTime() > Date.now() ? ' faol' : ' — muddati tugagan'}`
    : free ? 'Muddatsiz. Har doim bepul.' : 'To‘lov hamyon balansidan';

  return (
    <article id={free ? 'free' : 'pro'} tabIndex={-1} className={cn(styles.card, featured && styles.featured, isCurrent && styles.current)} aria-label={`${PLAN_NAMES[item.code]} tarifi`}>
      <div className={styles.cardTopline}>
        <span className={styles.cardEdition}>{free ? 'BEPUL TARIF' : 'FAOL SAVDO UCHUN'}</span>
        {isCurrent ? (
          <span className={styles.currentPill}><span />Sizning tarifingiz</span>
        ) : null}
      </div>

      <div className={styles.cardBody}>
        <div className={styles.cardHeading}>
          <h2>{PLAN_NAMES[item.code]}</h2>
          <p>{TAGLINES[item.code]}</p>
        </div>
        <div className={styles.pricing}>
          <div key={period} className={styles.price}>
            <span>{free ? '0' : price === undefined ? '—' : formatTiyin(price)}</span>
            <span className={styles.priceUnit}>{free ? 'so‘m' : `so‘m / ${period === 'YEAR' ? 'yil' : 'oy'}`}</span>
          </div>
          <div className={styles.priceHint}>
            {free ? 'Obuna to‘lovi yo‘q' : 'Avtomatik pul yechilmaydi'}
          </div>
        </div>
        <div className={styles.cardFooter}>
          {action === 'free-anon' ? (
            <span className={styles.freeLabel}><Check size={15} aria-hidden />Bepul foydalaning</span>
          ) : (
            <Button type="button" size="lg" disabled={disabled} onClick={onSelect} variant={featured ? 'secondary' : 'outline'} className={cn(styles.cardButton, !free && styles.paidButton, featured && styles.premiumButton)}>
              {busy ? 'Kuting…' : !capacity ? 'Pochta limiti aniqlanmadi' : CTA[action]}
              {!disabled && <ArrowUpRight size={17} aria-hidden />}
            </Button>
          )}
          <span className={styles.cardNote}>{note}</span>
        </div>
        <div className={styles.cardDivider} />
        <ul className={styles.features}>
          {features.map((feature) => <li key={feature}><Check size={15} strokeWidth={1.8} aria-hidden /><span>{feature}</span></li>)}
        </ul>
        {capacity && custom !== 0 && (
          <div className={styles.emailExample}><Mail size={13} aria-hidden /><span>sizningnomingiz<span>@efbazaar.uz</span></span></div>
        )}

      </div>
    </article>
  );
}
