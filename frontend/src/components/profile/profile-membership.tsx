'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, BarChart3, Bell, Mail, RefreshCw } from 'lucide-react';
import { usePlanNow } from '@/hooks/use-plan-now';
import { Button } from '@/components/ui/button';
import { MembershipPass } from '@/components/plans/membership-pass';
import { formatPlanDate, membershipState, expiredPlanName, PLAN_NAMES, type MyPlan, type PlanCatalogItem } from '@/lib/plans';
import { formatTiyin } from '@/lib/money';
import styles from './profile-membership.module.css';

export function ProfileMembership({ plan, catalog, displayName, now: fixedNow }: {
  plan: MyPlan | null;
  catalog: PlanCatalogItem[] | null;
  displayName: string;
  now?: Date;
}) {
  const router = useRouter();
  const clockNow = usePlanNow(plan);
  const now = fixedNow ?? clockNow;
  const state = membershipState(plan, now);
  const live = state === 'active' || state === 'unlimited';
  const pro = live && plan?.code === 'PRO';
  const price = catalog?.find(p => p.code === 'PRO')?.prices.MONTH;
  const ended = state === 'expired' || state === 'grace' || state === 'recovery';
  const title = state === 'unknown' ? 'Tarif aniqlanmadi'
    : state === 'staff' ? 'Admin · cheklovsiz'
    : pro ? 'Pro faol'
    : live && plan ? PLAN_NAMES[plan.code]
    : ended && plan ? `Free · ${expiredPlanName(plan)} muddati tugagan` : 'Sizning tarifingiz — Free';
  return <section aria-label="A’zolik va tarif" className={styles.membership} data-state={state}>
    <div className={styles.details}>
      <span className={styles.eyebrow}>EFBAZAAR A’ZOLIGI</span>
      <h2>{title}</h2>
      {state === 'unknown' ? <>
        <p>Tarif ma’lumotlarini hozir tekshira olmadik.</p>
        <Button variant="outline" onClick={() => router.refresh()}><RefreshCw size={16} aria-hidden />Qayta urinish</Button>
      </> : state === 'staff' ? <>
        <p>Admin sifatida barcha imkoniyatlar cheklovsiz. Tarif xarid qilish shart emas.</p>
        <Link className={styles.textLink} href="/plans">Tariflarni ko‘rish <ArrowRight size={16} aria-hidden /></Link>
      </> : live && plan ? <>
        <p>{state === 'unlimited' ? 'Muddatsiz a’zolik. Uzaytirish talab qilinmaydi.' : `${formatPlanDate(plan.expiresAt!)} gacha.${pro ? ' Uzaytirsangiz, yangi oy shu sanadan qo‘shiladi.' : ''}`}</p>
        <div className={styles.actions}>
          {state === 'active' && pro ? <Button asChild variant="secondary"><Link href="/plans?intent=pro#pro">Pro’ni uzaytirish <ArrowRight size={16} aria-hidden /></Link></Button> : <Link className={styles.textLink} href="/plans">Tarif tafsilotlari <ArrowRight size={16} aria-hidden /></Link>}
        </div>
        <nav aria-label="A’zolik imkoniyatlari" className={styles.shortcuts}>
          <Link href="/watches"><Bell size={15} aria-hidden />Kuzatuvlar</Link>
          <Link href="/seller-analytics"><BarChart3 size={15} aria-hidden />Hisobot</Link>
          <Link href="/mailboxes/custom"><Mail size={15} aria-hidden />Email</Link>
        </nav>
      </> : <>
        {state === 'grace' && plan?.graceEndsAt ? <p>Grace: ortiqcha qutilarda {formatPlanDate(plan.graceEndsAt)} gacha to‘liq o‘qish saqlanadi. Keyin Recovery rejimi qoladi.</p>
          : state === 'recovery' ? <p>Ortiqcha qutilar Recovery rejimida: muhim Konami tiklash va xavfsizlik xatlari saqlanadi. Qutilaringiz o‘chirilmaydi.</p>
          : ended && plan ? <p>{expiredPlanName(plan)} muddati tugagan. Qutilaringiz va saqlangan ma’lumotlaringiz o‘chirilmaydi.</p>
          : <p>Ko‘proq pochta, aqlli kuzatuvlar va sotuvchi vositalari bilan imkoniyatlaringizni kengaytiring.</p>}
        <div className={styles.actions}>
          <Button asChild><Link href="/plans?intent=pro#pro">Pro’ga o‘tish <ArrowRight size={16} aria-hidden /></Link></Button>
          {price !== undefined && <span className={styles.price}>{formatTiyin(price)} <span>so‘m / oy</span></span>}
        </div>
        <span className={styles.billingNote}>Avtomatik pul yechilmaydi</span>
      </>}
    </div>
    {pro && <div className={styles.pass}><MembershipPass owner={displayName} compact /></div>}
  </section>;
}
