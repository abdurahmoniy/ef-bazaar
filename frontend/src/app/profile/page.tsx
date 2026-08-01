import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MyGamerCardSection } from '@/components/gamer/my-gamer-card-section';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { LogoutButton } from '@/components/profile/logout-button';
import { ProfileAccount } from '@/components/profile/profile-account';
import { ProfileCards } from '@/components/profile/profile-cards';
import { ProfileListings } from '@/components/profile/profile-listings';
import { ProfileTabs, type ProfileTabId } from '@/components/profile/profile-tabs';
import { ProfileTrades } from '@/components/profile/profile-trades';
import { getMe } from '@/lib/auth';
import { getMyFavorites, getMyListings } from '@/lib/marketplace-server';
import { getMyCards, getMyTrades } from '@/lib/trade-server';

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
  'trades',
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
  // Cards and trades are only fetched when their own tab is active — neither
  // carries a count badge, so the other tabs don't need them.
  const [listings, favorites, cards, tradePage] = await Promise.all([
    getMyListings(),
    getMyFavorites(),
    activeTab === 'kartalar' ? getMyCards() : Promise.resolve([]),
    activeTab === 'trades' ? getMyTrades() : Promise.resolve(null),
  ]);

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch>
      <div className="space-y-4">
        {/* Admin panel used to be a trailing button here; it lives in the header
            user menu now, alongside the other account-level entries. */}
        <MyGamerCardSection
          email={user.email ?? null}
          navSlot={
            <ProfileTabs
              active={activeTab}
              counts={{
                listings: listings.length,
                favorites: favorites.length,
              }}
            />
          }
        />

        {/* Keyed on the tab so each switch remounts and replays panel-in. */}
        <section key={activeTab} className="animate-panel-in">
          {activeTab === 'listings' && <ProfileListings listings={listings} />}
          {activeTab === 'trades' && <ProfileTrades trades={tradePage?.items ?? []} />}
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
