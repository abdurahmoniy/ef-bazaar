import { PlanNotices } from '@/components/profile/plan-notices';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, Plus } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { ProfileAccount } from '@/components/profile/profile-account';
import { ProfileCards } from '@/components/profile/profile-cards';
import { ProfileAccounts } from '@/components/profile/profile-accounts';
import { ProfileListings } from '@/components/profile/profile-listings';
import { ProfileTrades } from '@/components/profile/profile-trades';
import { getMe } from '@/lib/auth';
import { getMyAccountsServer } from '@/lib/accounts-server';
import { getMyFavorites } from '@/lib/marketplace-server';
import { getMyCards, getMyTrades, getSellerRatingSummary } from '@/lib/trade-server';
import { getMyTradeAdminApplication } from '@/lib/trade-admin-applications-server';
import { getWallet } from '@/lib/payment-server';
import { getMyPlanSSR, getPlanCatalogSSR } from '@/lib/plans-server';
import { FEATURES } from '@/lib/feature-flags';
import { siteConfig } from '@/lib/site';
import { getAccountDisplayData } from '@/lib/account-display-server';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Profil',
  robots: { index: false, follow: false },
};

export type ProfileTabId = 'accounts' | 'trades' | 'favorites' | 'kartalar' | 'account';

interface ProfilePageProps {
  searchParams?: Promise<{ tab?: string; saved?: string; mailbox?: string }>;
}

const VALID_TABS: ProfileTabId[] = [
  'account',
  'accounts',
  'trades',
  'favorites',
  'kartalar',
];

function resolveTab(value: string | undefined): ProfileTabId {
  // Eski `?tab=listings` havolalari yo'qolmasin: bo'lim nomi o'zgardi,
  // odamlarning saqlab qo'ygan havolalari esa o'zgarmadi.
  const normalized = value === 'listings' ? 'accounts' : value;
  return VALID_TABS.includes(normalized as ProfileTabId) ? (normalized as ProfileTabId) : 'account';
}

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const params = searchParams ? await searchParams : {};
  const activeTab = resolveTab(params.tab);

  const mailboxId = typeof params.mailbox === 'string' && params.mailbox ? params.mailbox : null;
  const returnTo = mailboxId
    ? `/profile?mailbox=${encodeURIComponent(mailboxId)}`
    : activeTab === 'accounts' ? '/profile?tab=accounts' : '/profile';
  const user = await getMe();
  if (!user) redirect(`/auth/login?from=${encodeURIComponent(returnTo)}`);
  if (mailboxId) redirect(`${siteConfig.mailUrl}/settings/mailboxes?mailbox=${encodeURIComponent(mailboxId)}`);

  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT || 'EfBazaarBot';

  // Fetch tab data server-side.
  const [accounts, favorites, cards, tradePage, tradeAdminApplication, sellerRatingSummary, wallet, myPlan, planCatalog] = await Promise.all([
    getMyAccountsServer(),
    activeTab === 'favorites' || activeTab === 'account' ? getMyFavorites() : Promise.resolve([]),
    activeTab === 'kartalar' ? getMyCards() : Promise.resolve([]),
    activeTab === 'trades' ? getMyTrades() : Promise.resolve(null),
    activeTab === 'account' ? getMyTradeAdminApplication() : Promise.resolve(null),
    activeTab === 'account' ? getSellerRatingSummary(user.id) : Promise.resolve(null),
    activeTab === 'account' && FEATURES.wallet ? getWallet() : Promise.resolve(null),
    activeTab === 'account' ? getMyPlanSSR() : Promise.resolve(null),
    activeTab === 'account' ? getPlanCatalogSSR() : Promise.resolve(null),
  ]);

  const accountDisplay = activeTab === 'accounts' ? await getAccountDisplayData(accounts, user.id) : {};

  // Sotilgan / obmen qilinganlar tarix: ular endi egasida emas.
  const ownedAccounts = accounts.filter((a) => a.status !== 'ARCHIVED');
  const soldCount = accounts.length - ownedAccounts.length;

  const getSubpageHeader = () => {
    switch (activeTab) {
      case 'accounts':
        return {
          title: 'Akkountlarim',
          subtitle: accounts.length > 0
            ? `${ownedAccounts.length} ta akkount · ${ownedAccounts.filter((a) => a.onMarket).length} tasi bozorda`
              + (soldCount > 0 ? ` · ${soldCount} tasi sotilgan` : '')
            : "Hozircha akkount yo'q",
          rightAction: (
            <Link
              href="/profile/accounts/new"
              title="Yangi akkount qo'shish"
              aria-label="Yangi akkount qo'shish"
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl bg-primary text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 md:w-auto md:rounded-lg md:px-4 md:text-sm"
            >
              <Plus aria-hidden className="h-5 w-5" />
              <span className="hidden md:inline">Qo&apos;shish</span>
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
    <MarketplaceShell user={user} activeTab={activeTab === 'accounts' ? 'accounts' : 'profile'} hideSearch hideHeader>
      <div key={user.id} className="space-y-3 pb-24">
        {/* Subpage Mobile App Sticky Top Header */}
        {subpageHeader && (
          <div className="-mx-4 -mt-4 sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/60 bg-background/95 px-4 py-3 backdrop-blur-md sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:px-5 sm:shadow-xs md:top-14">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              {activeTab !== 'accounts' && <Link
                href="/profile"
                aria-label="Profilga qaytish"
                className="grid h-11 w-11 place-items-center rounded-full bg-muted/60 text-foreground transition hover:bg-muted active:scale-90"
              >
                <ChevronLeft className="h-5 w-5" />
              </Link>}
              <div className="min-w-0">
                <h1 className={activeTab === 'accounts' ? "text-xl font-bold leading-none text-foreground md:text-base" : "text-base font-bold text-foreground leading-none"}>
                  {subpageHeader.title}
                </h1>
                <p className="text-xs text-muted-foreground mt-1">
                  {activeTab === 'accounts' ? <><span className="md:hidden">{ownedAccounts.length} ta aktiv · {soldCount} ta arxivda</span><span className="hidden md:inline">{subpageHeader.subtitle}</span></> : subpageHeader.subtitle}
                </p>
              </div>
            </div>

            {subpageHeader.rightAction}
          </div>
        )}

        {/* Tab content view */}
        <section key={activeTab} className="animate-panel-in">
          {activeTab === 'accounts' && <ProfileAccounts accounts={accounts} displayById={accountDisplay} viewerId={user.id} savedAccountId={typeof params.saved === 'string' ? params.saved : undefined} />}
          {activeTab === 'trades' && <ProfileTrades trades={tradePage?.items ?? []} />}
          {activeTab === 'favorites' && <ProfileListings listings={favorites} favorites />}
          {activeTab === 'kartalar' && <ProfileCards cards={cards} />}
          {activeTab === 'account' && (
            <ProfileAccount
              user={user}
              googleClientId={googleClientId}
              botUsername={botUsername}
              tradeAdminApplication={tradeAdminApplication}
              listingsCount={ownedAccounts.length}
              favoritesCount={favorites.length}
              ratingSummary={sellerRatingSummary}
              availableTiyin={wallet?.availableTiyin ?? null}
              plan={myPlan}
              planCatalog={planCatalog}
            >
              <PlanNotices />
            </ProfileAccount>
          )}
        </section>
      </div>
    </MarketplaceShell>
  );
}
