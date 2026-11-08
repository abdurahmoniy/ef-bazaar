import Link from 'next/link';
import { PopupHost } from '@/components/popups/popup-host';
import {
  MessageCircle,
  Plus,
  ShieldCheck,
  UserRound,
  UserPlus,
} from 'lucide-react';

import { ChatsUnreadBadge } from '@/components/chat/chats-unread-badge';
import { Logo } from '@/components/brand/logo';
import { MarketplaceSearch } from '@/components/marketplace/marketplace-search';
import { MeasuredBottomBar } from '@/components/marketplace/measured-bottom-bar';
import { SlidingNav, type SlidingNavItem } from '@/components/navigation/sliding-nav';
import { MobileBottomNav, type MarketplaceTab } from '@/components/navigation/mobile-bottom-nav';
import { TopBackButton } from '@/components/navigation/top-back-button';
import { ReferralCapture } from '@/components/referral/referral-capture';
import { CampaignCapture } from '@/components/campaign/campaign-capture';
import { UserMenu } from '@/components/navigation/user-menu';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import { FEATURES } from '@/lib/feature-flags';
import { GrowthLink } from '@/components/growth/growth-link';
import { SupportWidget } from '@/components/support/support-widget';
import { SessionCacheBoundary } from '@/components/providers/client-query-provider';

export type { MarketplaceTab } from '@/components/navigation/mobile-bottom-nav';

interface MarketplaceShellProps {
  user: User | null;
  /** Loading shells do not yet know whether the viewer has signed out. */
  sessionPending?: boolean;
  children: React.ReactNode;
  /**
   * Highlights the matching entry in the bottom tab bar and the desktop header
   * nav. Deliberately has no default — pages that live outside the tab set
   * (/blacklist, /gamers/[id]) must not light up an unrelated tab.
   */
  activeTab?: MarketplaceTab;
  /** Hides top-bar search — useful on the create form / profile edit flows. */
  hideSearch?: boolean;
  /** Hides top header on mobile (e.g. for profile hub). */
  hideHeader?: boolean;
  /** Current search text — populates the top-bar input on marketplace listing routes. */
  initialQuery?: string;
  /** Raw public marketplace query; search rewrites only its owned keys. */
  marketplaceQuery?: string;
  /** Collapses marketplace search after deliberate downward scrolling. */
  collapsibleSearch?: boolean;
  /**
   * When set, renders a chevron back button in the top-left of the header (and,
   * inside a Telegram Mini App, activates the native BackButton). Prefer this
   * over ad-hoc {@code BackLink} usage on drill-down pages.
   */
  backHref?: string;
  /** Accessible label for the back button — defaults to "Orqaga". */
  backLabel?: string;
  /**
   * Mobile-only sticky action bar. When provided it *replaces* the bottom tab
   * bar on small screens — drill-down pages (listing detail) want one primary
   * action within thumb reach, not two stacked bars eating the viewport.
   */
  mobileActionBar?: React.ReactNode;
  /** Hides the bottom navigation tab bar on mobile completely (e.g. for multi-step creation flows). */
  hideBottomNav?: boolean;
}

/**
 * Desktop (md+) header nav. Before this existed the bottom bar was the only
 * navigation in the shell and it is {@code md:hidden} — desktop users had no
 * route to Turnirlar at all.
 *
 * Sevimli used to hold the third slot and could never highlight: it points at
 * /profile?tab=favorites, and that page passes activeTab="profile". It is a
 * profile tab and now lives in the user menu. The slot went to /blacklist,
 * whose only inbound link was a footnote on the seller card — on a P2P account
 * market the scam list is the answer to the buyer's first objection, so it
 * belongs in the top row rather than three clicks down.
 */
function buildDesktopLinks(user: User | null, sessionPending: boolean): SlidingNavItem[] {
  return [
    { id: 'home', href: '/marketplace', label: 'Bozor' },
    { id: 'accounts', href: user || sessionPending ? '/profile?tab=accounts' : '/auth/login?from=%2Fprofile%3Ftab%3Daccounts', label: 'Akkountlarim' },
    { id: 'tournaments', href: '/tournaments', label: 'Turnirlar' },
    { id: 'safety', href: '/blacklist', label: 'Xavfsizlik' },
  ].filter((item) => {
    if (item.id === 'tournaments') return FEATURES.tournaments;
    if (item.id === 'safety') return FEATURES.blacklist;
    return true;
  });
}

export function MarketplaceShell({
  user,
  sessionPending = false,
  children,
  activeTab,
  hideSearch = false,
  hideHeader = false,
  initialQuery,
  marketplaceQuery = '',
  collapsibleSearch = false,
  backHref,
  backLabel,
  mobileActionBar,
  hideBottomNav = false,
}: MarketplaceShellProps) {
  const desktopLinks = buildDesktopLinks(user, sessionPending);

  return (
    <div
      data-marketplace-shell
      data-popup-user-id={!sessionPending ? user?.id : undefined}
      className="min-h-app bg-background"
    >
      {/*
        Hech nima chizmaydi. Bu yerda turibdi, ildiz layout'da emas,
        chunki layout foydalanuvchini bilmaydi va uni bilish uchun har
        sahifada qo'shimcha so'rov kerak bo'lardi. Shell esa uni
        allaqachon oladi va ro'yxatdan o'tgan odam tushadigan
        sahifalarning aksariyatini o'raydi.
      */}
      <ReferralCapture authenticated={!!user} />
      <CampaignCapture authenticated={!!user} />
      {!sessionPending && <PopupHost userId={user?.id ?? null} />}
      {!sessionPending && <SessionCacheBoundary accountId={user?.id ?? null} />}
      <header className={cn(
        "sticky top-0 z-40 border-b border-border surface-nav pt-[var(--app-content-safe-top)]",
        hideHeader && "hidden md:block"
      )}>
        <div className={cn(
          "mx-auto flex min-h-14 w-full max-w-[var(--app-content-max-width)] flex-wrap items-center gap-x-2 pl-[max(1rem,var(--app-content-safe-left))] pr-[max(1rem,var(--app-content-safe-right))] sm:h-14 sm:flex-nowrap sm:gap-3",
          activeTab === 'home' && "marketplace-home-header py-3 sm:py-0"
        )}>
          {backHref && <TopBackButton href={backHref} label={backLabel} className="-ml-2" />}
          <div className={cn("flex items-center", activeTab === 'home' && "hidden sm:flex")}>
            <Logo size="sm" href="/marketplace" />
          </div>

          <SlidingNav
            items={desktopLinks}
            activeId={activeTab}
            variant="underline"
            markerName="header-nav-marker"
            ariaLabel="Asosiy navigatsiya"
            className="ml-1 hidden shrink-0 overflow-visible md:block"
          />

          {!hideSearch && (
            <MarketplaceSearch
              rawQuery={marketplaceQuery}
              initialQuery={initialQuery}
              collapsible={collapsibleSearch}
            />
          )}

          {user && activeTab === 'home' && <NotificationBell className="ml-auto shrink-0 sm:hidden" />}

          {/*
            Three zones, one primary. Chats and the bell are borderless icons
            packed at gap-0 so they read as a single utility cluster; a hairline
            separates that cluster from Sotish, which is the only filled control
            in the row. Everything else a signed-in user needs (theme, Sevimli,
            Pochta, admin, logout) hangs off the avatar. Previously all five
            controls were equal-weight bordered pills with nothing marking the
            primary action.
          */}
          <div className={cn("ml-auto flex shrink-0 items-center gap-1.5", activeTab === 'home' && "hidden sm:flex")}>
            {user && activeTab !== 'home' && <NotificationBell className="shrink-0 sm:hidden" />}
            <GrowthLink href="/invite" event="invite_open" placement="desktop_header"
              className="hidden min-h-11 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex">
              <UserPlus aria-hidden className="h-4 w-4" />
              Do&apos;st taklif qilish
            </GrowthLink>
            {sessionPending ? (
              <div role="status" aria-label="Profil yuklanmoqda" className="h-9 w-20 animate-pulse rounded-full bg-muted motion-reduce:animate-none" />
            ) : user ? (
              <>
                <div className="hidden items-center sm:flex">
                  <Button asChild variant="ghost" size="sm" className="h-9 w-9 p-0" title="Chatlar">
                    <Link prefetch={false} href="/chats" aria-label="Chatlar">
                      <span className="relative">
                        <MessageCircle className="h-5 w-5" />
                        <ChatsUnreadBadge viewerId={user.id} />
                      </span>
                    </Link>
                  </Button>
                  <NotificationBell />
                </div>

                <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />

                <Button asChild size="sm" className="hidden h-9 rounded-full px-3 sm:inline-flex lg:px-4">
                  <Link prefetch={false} href="/marketplace/new">
                    <Plus className="h-4 w-4" />
                    <span className="hidden lg:inline">Sotish</span>
                  </Link>
                </Button>

                <UserMenu user={user} />
              </>
            ) : (
              <>
                <ThemeToggle className="h-9 w-9 rounded-full" />
                <Button asChild size="sm" className="h-9 rounded-full px-3 lg:px-4">
                  <Link prefetch={false} href="/auth/login">
                    <UserRound className="h-4 w-4" />
                    <span className="hidden sm:inline">Kirish</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>

      </header>

      {user && !user.verified && !(user.googleLinked && user.telegramLinked) && activeTab !== 'profile' && (
        <div className="border-b border-border/70 bg-warning-soft text-warning">
          <div className="mx-auto flex w-full max-w-[var(--app-content-max-width)] items-center gap-2 px-4 py-1.5 text-[11px] font-semibold">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="marketplace-verification-copy min-w-0 flex-1 truncate">
              {!user.telegramLinked && !user.googleLinked ? 'Telegram va Google ulang' : !user.telegramLinked ? 'Telegram ulang' : 'Google ulang'}
            </span>
            <Link
              href="/profile?tab=account"
              className="tap-press shrink-0 rounded-md bg-warning/10 px-2 py-1 hover:bg-warning/20"
            >
              Tasdiqlash
            </Link>
          </div>
        </div>
      )}

      <main data-page-transition className={cn("marketplace-shell-content mx-auto flex w-full max-w-[var(--app-content-max-width)] flex-col gap-4 pl-[max(1rem,var(--app-content-safe-left))] pr-[max(1rem,var(--app-content-safe-right))] pt-4 md:py-6", mobileActionBar && "md:pb-[calc(var(--marketplace-bottom-bar-height)+1rem)] lg:pb-6")}>
        {children}
      </main>

      <SupportWidget user={user} />

      {mobileActionBar ? (
        <MeasuredBottomBar
          key="marketplace-action-bar"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border surface-nav lg:hidden"
        >
          <div className="mx-auto w-full max-w-[var(--app-content-max-width)] px-4 py-2.5 pb-[calc(0.625rem+var(--app-content-safe-bottom))]">
            {mobileActionBar}
          </div>
        </MeasuredBottomBar>
      ) : hideBottomNav ? null : (
        <MobileBottomNav user={user} sessionPending={sessionPending} activeTab={activeTab} />
      )}
    </div>
  );
}
