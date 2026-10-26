import Link from 'next/link';
import type { MailboxSummary } from '@/lib/mail-types';
import { MAIN_SITE_URL } from '@/lib/site';
export function MailboxAccessBanner({ mailbox }: { mailbox: MailboxSummary }) {
  if (mailbox.accessState !== 'GRACE' && mailbox.accessState !== 'RECOVERY') return null;
  const date = (value: string) => new Intl.DateTimeFormat('uz-UZ', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
  return <aside className="space-y-2 border-b border-warning-border bg-warning-soft p-4 text-sm text-warning" aria-label="Pochta kirish holati">
    <h2 className="font-bold">{mailbox.accessState === 'GRACE' ? 'Grace — to‘liq o‘qish vaqtincha saqlanadi' : 'Recovery — cheklangan pochta'}</h2>
    <p>{mailbox.accessState === 'GRACE' ? '30 kun davomida barcha xatlar o‘qiladi. Bu davr yangi Pro joylarini bermaydi.' : 'Faqat muhim Konami parol tiklash va xavfsizlik xatlari ko‘rsatiladi. Boshqa xatlarga kirish server tomonidan cheklangan.'}</p>
    {mailbox.paidExpiresAt && <p>Pro tugagan: {date(mailbox.paidExpiresAt)}</p>}
    {mailbox.graceEndsAt && <p>Grace tugashi: {date(mailbox.graceEndsAt)}</p>}
    <p>Pro uzaytirilsa mavjud qutilaringizga to‘liq kirish qaytadi.</p>
    <div className="flex flex-wrap gap-3"><Link className="inline-flex min-h-11 items-center font-semibold underline" href={`${MAIN_SITE_URL}/plans`}>Pro uzaytirish</Link><Link className="inline-flex min-h-11 items-center underline" href={`/settings/mailboxes?mailbox=${encodeURIComponent(mailbox.id)}`}>Free uchun 3 qutini tanlash</Link></div>
  </aside>;
}
