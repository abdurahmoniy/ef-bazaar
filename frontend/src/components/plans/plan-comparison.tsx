import { Check, Minus } from 'lucide-react';
import { mailboxCapacity, numericGrant, type PlanCatalogItem } from '@/lib/plans';
import styles from './plans.module.css';

function number(item: PlanCatalogItem, key: string, suffix = '') {
  const value = numericGrant(item, key);
  return value === undefined ? 'Aniqlanmoqda' : value === null ? 'Cheksiz' : `${value}${suffix}`;
}
function boolean(item: PlanCatalogItem, key: string) {
  const value = item.entitlements[key];
  return value === 'true' ? <><Check size={17} aria-hidden /><span className="sr-only">Bor</span></> : value === 'false' ? <><Minus size={17} aria-hidden /><span className="sr-only">Yo‘q</span></> : 'Aniqlanmoqda';
}
export function PlanComparison({ catalog }: { catalog: PlanCatalogItem[] }) {
  const free = catalog.find(p => p.code === 'STANDARD');
  const pro = catalog.find(p => p.code === 'PRO');
  if (!free || !pro) return null;
  const rows = [
    { label: 'Jami pochta qutisi', render: (p: PlanCatalogItem) => mailboxCapacity(p.entitlements) ? number(p, 'mailbox.total_slots') : 'Aniqlanmoqda' },
    { label: 'Shundan yangi shaxsiy email', render: (p: PlanCatalogItem) => mailboxCapacity(p.entitlements) ? number(p, 'mailbox.custom_slots') : 'Aniqlanmoqda' },
    { label: 'Saqlangan qidiruv', render: (p: PlanCatalogItem) => number(p, 'watch.search_limit') },
    { label: 'Narx kuzatuvi', render: (p: PlanCatalogItem) => number(p, 'watch.price_limit') },
    { label: 'Kuzatuv xabarlari', render: (p: PlanCatalogItem) => p.entitlements['watch.immediate'] === 'true' ? 'Mos yangilik topilganda' : p.entitlements['watch.immediate'] === 'false' ? 'Kunlik jamlanma' : 'Aniqlanmoqda' },
    { label: 'Sotuvchi hisoboti', render: (p: PlanCatalogItem) => numericGrant(p, 'analytics.history_days') === 0 ? 'Asosiy umumiy ko‘rsatkichlar' : numericGrant(p, 'analytics.history_days') === undefined ? 'Aniqlanmoqda' : `${number(p, 'analytics.history_days', ' kungacha')} mavjud tarix` },
    { label: 'Hisobotni CSV yuklash', render: (p: PlanCatalogItem) => boolean(p, 'analytics.export') },
    { label: 'Qayd va shablonlar', render: (p: PlanCatalogItem) => p.entitlements['seller.tools'] === 'true' ? 'Yaratish va tahrirlash' : p.entitlements['seller.tools'] === 'false' ? 'Mavjudlarini o‘qish va eksport' : 'Aniqlanmoqda' },
    { label: 'Guruhlab narxni o‘zgartirish / bozordan olish', render: (p: PlanCatalogItem) => boolean(p, 'seller.bulk') },
    { label: 'Profil muqovasi', render: (p: PlanCatalogItem) => boolean(p, 'profile.decoration') },
  ];
  return <section id="compare" className={styles.comparison} aria-labelledby="comparison-title">
    <div className={styles.sectionHeading}><span className={styles.eyebrow}>SIZGA QAYSI BIRI MOS?</span><h2 id="comparison-title">Imkoniyatlar yonma-yon</h2><p>Kundalik ehtiyojingizga mos tarifni tanlang. Pro — a’zolik, sotuvchining tasdiqlanganlik belgisi emas.</p></div>
    <div className={styles.tableWrap}><table className={styles.compareTable}><thead><tr><th scope="col">Imkoniyat</th><th scope="col">Free</th><th scope="col">Pro</th></tr></thead><tbody>{rows.map(row => <tr key={row.label}><th scope="row">{row.label}</th>{[free, pro].map(p => <td key={p.code}>{row.render(p)}</td>)}</tr>)}</tbody></table></div>
    <p className={styles.tableNote}>Hisobot faqat to‘plangan ma’lumotlarni ko‘rsatadi. Mos yangilik aniqlangach, xabar yetib kelishi biroz vaqt olishi mumkin.</p>
  </section>;
}
