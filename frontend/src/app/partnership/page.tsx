import { PartnershipFlow } from '@/components/partners/partnership-flow';

export const dynamic = 'force-dynamic';

export default function PartnershipPage() {
  /*
   * Bot nomi SERVERDA o'qiladi va propga uzatiladi.
   *
   * `NEXT_PUBLIC_*` o'zgaruvchilari Next.js tomonidan BUILD paytida kodga
   * yozib qo'yiladi. Konteynerga ish vaqtida berilgan qiymat klient
   * komponentiga umuman yetib bormaydi — ekranda "botimizni" degan
   * zaxira matn qolib ketadi va buni faqat sahifani ochib ko'rgan odam
   * sezadi. Server komponenti esa Node ustida ishlaydi, ya'ni o'zgaruvchini
   * ish vaqtida o'qiydi.
   */
  const botUsername = (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT ??
    process.env.TELEGRAM_BOT_USERNAME ??
    ''
  ).replace('@', '');

  return <PartnershipFlow botUsername={botUsername} />;
}
