import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { InvitePanel } from '@/components/referral/invite-panel';
import { getMe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Do‘st taklif qilish',
  description: 'Do‘stlaringizni EFBazaar’ga taklif qiling va taklif natijalarini kuzating.',
  robots: { index: false, follow: false },
};

export default async function InvitePage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/invite');

  /*
   * Bot nomi SERVERDA o'qiladi va propga uzatiladi — hamkorlik
   * sahifasidagi bilan bir xil sabab. `NEXT_PUBLIC_*` build paytida
   * kodga yozib qo'yiladi, ya'ni konteynerga ish vaqtida berilgan
   * qiymat klient komponentiga yetib bormaydi.
   */
  const botUsername = (
    process.env.NEXT_PUBLIC_TELEGRAM_BOT ??
    process.env.TELEGRAM_BOT_USERNAME ??
    ''
  ).replace('@', '');

  return (
    <MarketplaceShell user={user} hideSearch backHref="/profile">
      <InvitePanel botUsername={botUsername} />
    </MarketplaceShell>
  );
}
