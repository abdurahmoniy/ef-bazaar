'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePlanNow } from '@/hooks/use-plan-now';
import { Button } from '@/components/ui/button';
import { formatPlanDate, membershipState, expiredPlanName, PLAN_NAMES, type MyPlan, type PlanCatalogItem } from '@/lib/plans';
import { formatTiyin } from '@/lib/money';
import styles from './profile-membership.module.css';

export function ProfileMembership({ plan, catalog, now: fixedNow }: {
  plan: MyPlan | null;
  catalog: PlanCatalogItem[] | null;
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
    : ended && plan ? `Free · ${expiredPlanName(plan)} muddati tugagan` : 'Free';
  const detail = state === 'unknown' ? 'Hozir tekshira olmadik.'
    : state === 'staff' ? 'Barcha imkoniyatlar ochiq.'
    : state === 'unlimited' ? 'Muddatsiz a’zolik.'
    : live && plan ? `${formatPlanDate(plan.expiresAt!)} gacha`
    : state === 'grace' && plan?.graceEndsAt ? `Grace: ortiqcha qutilar ${formatPlanDate(plan.graceEndsAt)} gacha o‘qiladi.`
    : state === 'recovery' ? 'Ortiqcha qutilar Recovery rejimida. Hech narsa o‘chirilmaydi.'
    : ended ? 'Qutilar va saqlangan ma’lumotlar o‘chirilmaydi.'
    : price !== undefined ? `Pro — ${formatTiyin(price)} so‘m / oy. Avtomatik pul yechilmaydi.`
    : 'Ko‘proq pochta, kuzatuvlar va sotuvchi vositalari.';
  const action = state === 'unknown'
    ? <Button variant="outline" size="sm" className="min-h-11" onClick={() => router.refresh()}>Qayta urinish</Button>
    : state === 'active' && pro ? <Button asChild variant="outline" size="sm" className="min-h-11"><Link href="/plans?intent=pro#pro">Pro’ni uzaytirish</Link></Button>
    : live || state === 'staff' ? <Link className={styles.textLink} href="/plans">Tarif tafsilotlari</Link>
    : <Button asChild size="sm" className="min-h-11"><Link href="/plans?intent=pro#pro">Pro’ga o‘tish</Link></Button>;
  return <section aria-label="A’zolik va tarif" className={styles.membership} data-state={state}>
    <div className={styles.details}>
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
    {action}
  </section>;
}
