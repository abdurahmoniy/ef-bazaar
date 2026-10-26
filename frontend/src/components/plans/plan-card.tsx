'use client';

import { ArrowUpRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { formatTiyin } from '@/lib/money';
import {
  PLAN_NAMES, planBenefits, mailboxCapacity, formatPlanDate,
  type PlanAction, type PlanCatalogItem, type PlanPeriod,
} from '@/lib/plans';
import { cn } from '@/lib/utils';
import styles from './plans.module.css';

const TAGLINES: Record<PlanCatalogItem['code'], string> = {
  STANDARD: 'Kundalik foydalanish uchun.',
  PRO: 'Faol savdo uchun ko‘proq imkoniyat.',
  MAX: 'Kengroq imkoniyat. O‘zingizga xos daraja.',
  STAFF: 'Barcha imkoniyatlar siz uchun ochiq.',
};
export type CardAction = PlanAction | 'free-anon' | 'unknown' | 'pending';
const CTA: Record<CardAction, string> = {
  'free-anon': 'Bepul', unknown: 'Tarif aniqlanmadi', pending: 'Faollashtirilmoqda',
  choose: 'Pro’ga o‘tish', extend: 'Pro’ni uzaytirish', upgrade: 'Pro’ga o‘tish',
  unavailable: 'Joriy tarif tugagach', 'current-free': 'Joriy tarif',
  'unlimited-current': 'Muddatsiz faol', staff: 'Admin: cheklovsiz',
};
interface PlanCardProps {
  item: PlanCatalogItem;
  period: PlanPeriod;
  action: CardAction;
  isCurrent: boolean;
  expiresAt: string | null;
  busy: boolean;
  featured?: boolean;
  recovery?: { href: string; message: string; shortfallSom?: number } | null;
  onSelect: () => void;
}
export function PlanCard({ item, period, action, isCurrent, expiresAt, busy, featured = false, recovery, onSelect }: PlanCardProps) {
  const recoveryRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (recovery) recoveryRef.current?.focus(); }, [recovery]);
  const free = item.code === 'STANDARD';
  const price = item.prices[period];
  const capacity = mailboxCapacity(item.entitlements);
  const disabled = !capacity || busy || action === 'pending' || (price === undefined && !free) || action === 'unavailable' || action === 'current-free' || action === 'unlimited-current' || action === 'unknown' || action === 'staff';
  const features = capacity ? [
    capacity.total === null ? 'Cheksiz jami pochta qutisi' : `${capacity.total} ta jami pochta qutisi`,
    ...(capacity.custom === null ? ['Shundan cheksiz yangi shaxsiy email'] : capacity.custom > 0 ? [`Shundan ${capacity.custom} ta yangi shaxsiy email`] : []),
    ...planBenefits(item).filter(f => !f.startsWith('Mos yangilik') && !f.startsWith('Kuzatuvlardan')).slice(0, 3),
  ] : ['Pochta limiti aniqlanmadi'];
  const note = isCurrent && !free && expiresAt
    ? `${formatPlanDate(expiresAt)} gacha${new Date(expiresAt).getTime() > Date.now() ? ' faol' : ' — muddati tugagan'}`
    : free ? 'Muddatsiz. Har doim bepul.' : 'To‘lov hamyon balansidan';
  return <article id={free ? 'free' : 'pro'} className={cn(styles.card, featured && styles.featured)} aria-label={`${PLAN_NAMES[item.code]} tarifi`}>
    <div className={styles.cardHeader}>
      <div className={styles.cardTopline}>
        <span className={styles.cardEdition}>{free ? 'BEPUL TARIF' : 'PRO A’ZOLIK'}</span>
        {isCurrent && <span className={styles.currentPill}><span />Sizning tarifingiz</span>}
      </div>
      <div className={styles.cardHeading}><h2>{PLAN_NAMES[item.code]}</h2><p>{TAGLINES[item.code]}</p></div>
      <div className={styles.pricing}>
        <div className={styles.price}><span>{free ? '0' : price === undefined ? '—' : formatTiyin(price)}</span><span className={styles.priceUnit}>{free ? 'so‘m' : `so‘m / ${period === 'YEAR' ? 'yil' : 'oy'}`}</span></div>
        <p className={styles.priceHint}>{free ? 'Obuna to‘lovi yo‘q' : 'Avtomatik pul yechilmaydi'}</p>
      </div>
    </div>
    <div className={styles.cardBody}>
      <ul className={styles.features}>{features.map(feature => <li key={feature}><Check size={16} strokeWidth={1.8} aria-hidden /><span>{feature}</span></li>)}</ul>
      <div className={styles.cardFooter}>
        {recovery ? <div ref={recoveryRef} role="alert" tabIndex={-1} className={styles.recovery}>
          <p className={styles.recoveryTitle}>{recovery.shortfallSom !== undefined ? `Yana ${formatTiyin(recovery.shortfallSom * 100)} so‘m kerak` : recovery.message}</p>
          <p className={styles.recoveryHint}>Qaytgach, xaridni o‘zingiz tasdiqlaysiz.</p>
          <Button asChild variant="secondary" className={styles.cardButton}><Link href={recovery.href}>Hamyonni to‘ldirish <ArrowUpRight size={16} aria-hidden /></Link></Button>
          <button type="button" className={styles.retryButton} onClick={onSelect} disabled={disabled}>Qayta urinish</button>
        </div> : action === 'free-anon' ? <span className={styles.freeLabel}><Check size={15} aria-hidden />Bepul foydalaning</span> : <>
          <Button type="button" size="lg" disabled={disabled} onClick={onSelect} variant={featured ? 'secondary' : 'outline'} className={styles.cardButton}>
            {busy ? 'Kuting…' : !capacity ? 'Pochta limiti aniqlanmadi' : CTA[action]}
            {!disabled && <ArrowUpRight size={17} aria-hidden />}
          </Button>
          <span className={styles.cardNote}>{note}</span>
        </>}
      </div>
    </div>
  </article>;
}
