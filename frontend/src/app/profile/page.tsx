import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Plus } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { ProfileAccount } from '@/components/profile/profile-account';
import { ProfileCards } from '@/components/profile/profile-cards';
import { ProfileListings } from '@/components/profile/profile-listings';
import { ProfileTrades } from '@/components/profile/profile-trades';
import { getMe } from '@/lib/auth';
import { getMyFavorites, getMyListings } from '@/lib/marketplace-server';
import { getMyCards, getMyTrades, getSellerRatingSummary } from '@/lib/trade-server';
import { getMyTradeAdminApplication } from '@/lib/trade-admin-applications-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Profil',
  robots: { index: false, follow: false },
};

export type ProfileTabId = 'listings' | 'trades' | 'favorites' | 'kartalar' | 'account';

interface ProfilePageProps {
  searchParams?: Promise<{ tab?: string }>;
}

const VALID_TABS: ProfileTabId[] = [
  'account',
  'listings',
  'trades',
  'favorites',
  'kartalar',
];

function resolveTab(value: string | undefined): ProfileTabId {
  return VALID_TABS.includes(value as ProfileTabId) ? (value as ProfileTabId) : 'account';
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = searchParams ? await searchParams : {};
  const activeTab = resolveTab(params.tab);

  const user = await getMe();
  if (!user) redirect('/auth/login?from=/profile');

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';

  // Fetch tab data server-side.
  const [listings, favorites, cards, tradePage, tradeAdminApplication, sellerRatingSummary] = await Promise.all([
    getMyListings(),
    getMyFavorites(),
    activeTab === 'kartalar' ? getMyCards() : Promise.resolve([]),
    activeTab === 'trades' ? getMyTrades() : Promise.resolve(null),
    activeTab === 'account' ? getMyTradeAdminApplication() : Promise.resolve(null),
    activeTab === 'account' ? getSellerRatingSummary(user.id) : Promise.resolve(null),
  ]);

  const getSubpageHeader = () => {
    switch (activeTab) {
      case 'listings':
        return {
          title: "E'lonlarim",
          subtitle: listings.length > 0 ? `${listings.length} ta faol e'lon` : "Hozircha e'lonlar yo'q",
          rightAction: (
            <Link
              href="/marketplace/new"
              title="Yangi e'lon joylash"
              aria-label="Yangi e'lon joylash"
              className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary transition hover:bg-primary/20 active:scale-90"
            >
              <Plus className="h-5 w-5" />
            </Link>
          ),
        };
      case 'trades':
        return {
          title: 'Savdolarim',
          subtitle: tradePage?.items?.length
            ? `${tradePage.items.length} ta bitim`
            : "Xavfsiz bitimlar tarixi",
        };
      case 'favorites':
        return {
          title: "Sevimli e'lonlar",
          subtitle: favorites.length > 0 ? `${favorites.length} ta saqlangan e'lon` : "Hozircha saqlanganlar yo'q",
        };
      case 'kartalar':
        return {
          title: "To'lov kartalarim",
          subtitle: cards.length > 0 ? `${cards.length} ta ulangan karta` : "Bank kartalari",
        };
      default:
        return null;
    }
  };

  const subpageHeader = getSubpageHeader();

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch hideHeader>
      <div className="space-y-3 pb-24">
        {/* Subpage Mobile App Sticky Top Header */}
        {subpageHeader && (
          <div className="-mx-4 -mt-4 sticky top-0 z-30 flex items-center justify-between border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:px-5 sm:shadow-xs">
            <div className="flex items-center gap-3">
              <Link
                href="/profile"
                aria-label="Profilga qaytish"
                className="grid h-9 w-9 place-items-center rounded-full bg-muted/60 text-foreground transition hover:bg-muted active:scale-90"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-base font-bold text-foreground leading-none">
                  {subpageHeader.title}
                </h1>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {subpageHeader.subtitle}
                </p>
              </div>
            </div>

            {subpageHeader.rightAction}
          </div>
        )}

        {/* Tab content view */}
        <section key={activeTab} className="animate-panel-in">
          {activeTab === 'listings' && <ProfileListings listings={listings} />}
          {activeTab === 'trades' && <ProfileTrades trades={tradePage?.items ?? []} />}
          {activeTab === 'favorites' && <ProfileListings listings={favorites} favorites />}
          {activeTab === 'kartalar' && <ProfileCards cards={cards} />}
          {activeTab === 'account' && (
            <ProfileAccount
              user={user}
              googleClientId={googleClientId}
              botUsername={botUsername}
              tradeAdminApplication={tradeAdminApplication}
              listingsCount={listings.length}
              favoritesCount={favorites.length}
              ratingSummary={sellerRatingSummary}
            />
          )}
        </section>
      </div>
    </MarketplaceShell>
  );
}
