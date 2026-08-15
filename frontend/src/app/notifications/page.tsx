import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { NotificationsView } from '@/components/notifications/notifications-view';
import { getMe } from '@/lib/auth';
import { getMyNotifications } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Bildirishnomalar',
  robots: { index: false, follow: false },
};

export default async function NotificationsPage() {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/notifications');

  const initialItems = await getMyNotifications();

  return (
    <MarketplaceShell
      user={user}
      activeTab="profile"
      hideSearch
      hideHeader
    >
      <NotificationsView initialItems={initialItems} />
    </MarketplaceShell>
  );
}
