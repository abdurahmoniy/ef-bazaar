import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { MyGamerCardSection } from '@/components/gamer/my-gamer-card-section';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { LogoutButton } from '@/components/profile/logout-button';
import { ProfileAccount } from '@/components/profile/profile-account';
import { ProfileCards } from '@/components/profile/profile-cards';
import { ProfileListings } from '@/components/profile/profile-listings';
import { ProfileTabs, type ProfileTabId } from '@/components/profile/profile-tabs';
import { isAdmin } from '@/lib/admin';
import { getMe } from '@/lib/auth';
import { getMyFavorites, getMyListings } from '@/lib/marketplace-server';
import { getMyCards } from '@/lib/trade-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Profil',
  robots: { index: false, follow: false },
};

interface ProfilePageProps {
  searchParams?: Promise<{ tab?: string }>;
}

const VALID_TABS: ProfileTabId[] = [
  'listings',
  'favorites',
  'kartalar',
  // 'pochta' is a link-out to /mail, never rendered inside the profile shell —
  // omit it here so ?tab=pochta falls back to 'listings' rather than a blank
  // section. Same for legacy ?tab=chats links: chats live at /chats now, the
  // profile no longer has a chats tab. Legacy ?tab=gamer also falls through
  // to 'listings' — the gamer card now renders as the page header.
  'account',
];

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
  // Cards are only fetched when the Kartalar tab is active — the list has no
  // count badge and the other tabs don't need it.
  const [listings, favorites, cards] = await Promise.all([
    getMyListings(),
    getMyFavorites(),
    activeTab === 'kartalar' ? getMyCards() : Promise.resolve([]),
  ]);

  const admin = isAdmin(user);

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch>
      <div className="space-y-4">
        <MyGamerCardSection
          email={user.email ?? null}
          trailingAction={
            admin ? (
              <Link
                href="/admin"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:border-primary/40 hover:bg-muted"
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
                Admin panel
              </Link>
            ) : null
          }
        />

        <ProfileTabs
          active={activeTab}
          counts={{
            listings: listings.length,
            favorites: favorites.length,
          }}
        />

        <section>
          {activeTab === 'listings' && <ProfileListings listings={listings} />}
          {activeTab === 'favorites' && <ProfileListings listings={favorites} favorites />}
          {activeTab === 'kartalar' && <ProfileCards cards={cards} />}
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
