import { ArrowUpRight, ChevronDown, ShieldCheck, Wallet } from 'lucide-react';
import Link from 'next/link';

import styles from './plans.module.css';
import { mailboxCapacity, type PlanCatalogItem } from '@/lib/plans';

const QUESTIONS = [
  {
    title: 'Savdo qutisi va shaxsiy emailning farqi nima?',
    answer: 'Savdo qutisi savdo jarayonida avtomatik beriladi. Shaxsiy emailda esa nomni o‘zingiz tanlaysiz va uni Konami akkountingizga ulaysiz. Ikkalasi umumiy limitga kiradi.',
  },
  {
    title: 'Tarif tugasa qutilarim nima bo‘ladi?',
    answer: 'Qutilaringiz o‘chirilmaydi. Pro tugagach ortiqcha qutilarda 30 kun to‘liq o‘qish saqlanadi (Grace). Keyin Recovery rejimida faqat muhim Konami parol tiklash va xavfsizlik xatlari o‘qiladi. Profilingizda Free limitiga mos qutilarni to‘liq o‘qish uchun tanlashingiz mumkin. Pro uzaytirilsa mavjud qutilarga kirish tiklanadi. Faol savdodagi quti savdo davomida ochiq qoladi.',
  },
  {
    title: 'To‘lov va uzaytirish qanday ishlaydi?',
    answer: 'To‘lov hamyon balansidan yechiladi. Avtomatik pul yechilmaydi — tarifni o‘zingiz uzaytirasiz. Shu tarifni oldindan uzaytirsangiz, yangi muddat joriy muddatning oxiriga qo‘shiladi.',
  },
  {
    title: 'Pro nimani o‘zgartiradi?',
    answer: 'Katalogda ko‘rsatilgan Pro huquqlari pochta, kuzatuvlar, hisobot, sotuvchi vositalari va profil muqovasini kengaytiradi. Xarid qabul qilingach xizmatlar yangilanishi biroz vaqt olishi mumkin. Pro a’zoligi tasdiqlanganlik yoki sotuvchi ishonchliligi belgisi emas.',
  },
];

export function PlansFaq({ catalog }: { catalog: PlanCatalogItem[] }) {
  const freePlan = catalog.find((p) => p.code === 'STANDARD');
  const proPlan = catalog.find((p) => p.code === 'PRO');
  const free = freePlan ? mailboxCapacity(freePlan.entitlements) : null;
  const pro = proPlan ? mailboxCapacity(proPlan.entitlements) : null;
  const quota = free && pro
    ? ` Free’da ${free.total === null ? 'cheksiz' : `jami ${free.total} ta`}, Pro’da ${pro.total === null ? 'cheksiz' : `jami ${pro.total} ta`} quti. Pro’da ${pro.total === null ? 'umumiy sig‘im' : `shu ${pro.total} ta`} ichida ${pro.custom === null ? 'cheksiz' : `${pro.custom} tagacha`} yangi shaxsiy email olishingiz mumkin.`
    : ' Pochta imkoniyatlari yangilanmoqda; limitlar aniqlangach ko‘rsatiladi.';
  return (
    <section className={styles.faq} aria-labelledby="plans-faq-title">
      <div className={styles.faqIntro}>
        <span className={styles.eyebrow}>HAMMASI TUSHUNARLI</span>
        <h2 id="plans-faq-title">Ko‘p beriladigan savollar</h2>
        <p>Tanlashdan oldin bilishingiz kerak bo‘lgan eng muhim narsalar.</p>
        <Link href="/support" className={styles.supportLink}>Yana savolingiz bormi? <ArrowUpRight size={15} aria-hidden /></Link>
      </div>
      <div className={styles.questions}>
        {QUESTIONS.map(({ title, answer }, index) => (
          <details key={title} className={styles.question}>
            <summary>{title}<ChevronDown size={17} aria-hidden /></summary>
            <p>{answer}{index === 0 ? quota : ''}</p>
          </details>
        ))}
        <div className={styles.assurances}>
          <span><Wallet size={14} aria-hidden />Hamyon orqali to‘lov</span>
          <span><ShieldCheck size={14} aria-hidden />Qutilar o‘chirilmaydi</span>
        </div>
      </div>
    </section>
  );
}
