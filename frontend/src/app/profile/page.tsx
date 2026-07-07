import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { LogoutButton } from '@/components/profile/logout-button';
import { ProfileAccount } from '@/components/profile/profile-account';
import { ProfileChats } from '@/components/profile/profile-chats';
import { ProfileHeader } from '@/components/profile/profile-header';
import { ProfileListings } from '@/components/profile/profile-listings';
import { ProfileTabs, type ProfileTabId } from '@/components/profile/profile-tabs';
import { isAdmin } from '@/lib/admin';
import { getMe } from '@/lib/auth';
import {
  getMyChats,
  getMyFavorites,
  getMyListings,
} from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Profil',
  robots: { index: false, follow: false },
};

interface ProfilePageProps {
  searchParams?: Promise<{ tab?: string }>;
}

const VALID_TABS: ProfileTabId[] = ['listings', 'chats', 'favorites', 'account'];

function resolveTab(value: string | undefined): ProfileTabId {
  return VALID_TABS.includes(value as ProfileTabId) ? (value as ProfileTabId) : 'listings';
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = searchParams ? await searchParams : {};
  const activeTab = resolveTab(params.tab);

  const user = await getMe();
  if (!user) redirect('/auth/login?from=/profile');

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';

  // Fetch tab data server-side. Fetch counts even for inactive tabs so the badges render.
  const [listings, chats, favorites] = await Promise.all([
    getMyListings(),
    getMyChats(),
    getMyFavorites(),
  ]);

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch>
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <ProfileHeader user={user} />
          {isAdmin(user) && (
            <Link
              href="/admin"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground shadow-card transition hover:border-primary/40"
            >
              <ShieldCheck className="h-4 w-4 text-primary" />
              Admin
            </Link>
          )}
        </div>

        <ProfileTabs
          active={activeTab}
          counts={{
            listings: listings.length,
            chats: chats.length,
            favorites: favorites.length,
          }}
        />

        <section>
          {activeTab === 'listings' && <ProfileListings listings={listings} />}
          {activeTab === 'chats' && <ProfileChats chatCount={chats.length} />}
          {activeTab === 'favorites' && <ProfileListings listings={favorites} favorites />}
          {activeTab === 'account' && (
            <ProfileAccount user={user} googleClientId={googleClientId} botUsername={botUsername} />
          )}
        </section>

        {activeTab === 'account' && (
          <div className="flex justify-end pt-2">
            <LogoutButton />
          </div>
        )}
      </div>
    </MarketplaceShell>
  );
}
