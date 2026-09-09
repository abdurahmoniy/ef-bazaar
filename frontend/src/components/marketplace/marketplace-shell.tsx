import Link from 'next/link';
import {
  Home,
  MessageCircle,
  Plus,
  ShieldCheck,
  Trophy,
  UserRound,
  Wallet,
  UserPlus,
} from 'lucide-react';

import { ChatsUnreadBadge } from '@/components/chat/chats-unread-badge';
import { Logo } from '@/components/brand/logo';
import { MarketplaceSearch } from '@/components/marketplace/marketplace-search';
import { MeasuredBottomBar } from '@/components/marketplace/measured-bottom-bar';
import { SlidingNav, type SlidingNavItem } from '@/components/navigation/sliding-nav';
import { TopBackButton } from '@/components/navigation/top-back-button';
import { ReferralCapture } from '@/components/referral/referral-capture';
import { UserMenu } from '@/components/navigation/user-menu';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';
import { FEATURES } from '@/lib/feature-flags';
import { GrowthLink } from '@/components/growth/growth-link';
import { SupportWidget } from '@/components/support/support-widget';

interface MarketplaceShellProps {
  user: User | null;
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

export type MarketplaceTab =
  | 'home'
  | 'tournaments'
  | 'safety'
  | 'sell'
  | 'chats'
  | 'profile'
  | 'wallet';

interface NavItem {
  id: MarketplaceTab;
  href: string;
  label: string;
  icon: React.ReactNode;
  requiresAuth: boolean;
  /** Renders as a raised circular FAB in the bottom bar instead of a flat tab. */
  primary?: boolean;
}

/**
 * Bottom tab bar (mobile). Five slots, no more — a sixth truncates labels on a
 * 360px phone. Sevimli is intentionally absent: it is a profile tab, and the
 * desktop header nav carries it.
 *
 * <p>Two entries are flag-gated and the budget only balances because one of
 * them is off: with FEATURES.wallet on and FEATURES.tournaments off this is
 * exactly five. Turning tournaments on makes it six and something has to give
 * — most likely Turnirlar moves to the desktop nav and the user menu, the way
 * Sevimli did. Do not just add it and hope; check it on a 360px viewport.
 */
function buildNavItems(user: User | null): NavItem[] {
  const all: NavItem[] = [
    { id: 'home', href: '/marketplace', label: 'Bozor', icon: <Home className="h-5 w-5" />, requiresAuth: false },
    {
      id: 'tournaments',
      href: '/tournaments',
      label: 'Turnirlar',
      icon: <Trophy className="h-5 w-5" />,
      requiresAuth: false,
    },
    {
      id: 'chats',
      href: user ? '/chats' : '/auth/login?from=/chats',
      label: 'Chatlar',
      icon: (
        <span className="relative">
          <MessageCircle className="h-5 w-5" />
          {user && <ChatsUnreadBadge />}
        </span>
      ),
      requiresAuth: true,
    },
    {
      id: 'sell',
      href: '/marketplace/new',
      label: 'Sotish',
      icon: <Plus className="h-5 w-5" />,
      requiresAuth: true,
      primary: true,
    },
    {
      id: 'wallet',
      href: user ? '/hamyon' : '/auth/login?from=/hamyon',
      label: 'Hamyon',
      icon: <Wallet className="h-5 w-5" />,
      requiresAuth: true,
    },
    {
      id: 'profile',
      href: user ? '/profile' : '/auth/login',
      label: user ? 'Profil' : 'Kirish',
      icon: <UserRound className="h-5 w-5" />,
      requiresAuth: false,
    },
  ];
  return all.filter((item) => {
    if (item.id === 'tournaments') return FEATURES.tournaments;
    if (item.id === 'wallet') return FEATURES.wallet;
    return true;
  });
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
function buildDesktopLinks(): SlidingNavItem[] {
  return [
    { id: 'home', href: '/marketplace', label: 'Bozor' },
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
  const items = buildNavItems(user);
  const desktopLinks = buildDesktopLinks();

  return (
    <div
      data-marketplace-shell
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
      <header className={cn(
        "relative z-40 border-b border-border surface-nav pt-[var(--app-content-safe-top)] md:sticky md:top-0",
        hideHeader && "hidden md:block"
      )}>
        <div className={cn(
          "mx-auto flex min-h-14 w-full max-w-6xl flex-wrap items-center gap-x-2 pl-[max(1rem,var(--app-content-safe-left))] pr-[max(1rem,var(--app-content-safe-right))] sm:h-14 sm:flex-nowrap sm:gap-3",
          activeTab === 'home' && "pt-3 sm:pt-0"
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
            <GrowthLink href="/invite" event="invite_open" placement="desktop_header"
              className="hidden min-h-11 items-center gap-1.5 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary dark:text-secondary transition hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex">
              <UserPlus aria-hidden className="h-4 w-4" />
              Do&apos;st taklif qilish
            </GrowthLink>
            {user ? (
              <>
                <div className="hidden items-center sm:flex">
                  <Button asChild variant="ghost" size="sm" className="h-9 w-9 p-0" title="Chatlar">
                    <Link href="/chats" aria-label="Chatlar">
                      <span className="relative">
                        <MessageCircle className="h-5 w-5" />
                        <ChatsUnreadBadge />
                      </span>
                    </Link>
                  </Button>
                  <NotificationBell />
                </div>

                <span aria-hidden className="hidden h-5 w-px bg-border sm:block" />

                <Button asChild size="sm" className="hidden h-9 rounded-full px-3 sm:inline-flex lg:px-4">
                  <Link href="/marketplace/new">
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
                  <Link href="/auth/login">
                    <UserRound className="h-4 w-4" />
                    <span className="hidden sm:inline">Kirish</span>
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>

      </header>

      {user && !user.verified && activeTab !== 'profile' && (
        <div className="border-b border-border/70 bg-amber-50/70 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
          <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-1.5 text-[11px] font-semibold">
            <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
            <span className="marketplace-verification-copy min-w-0 flex-1 truncate">
              Akkount tasdiqlanmagan — Telegram va Google ulang
            </span>
            <Link
              href="/profile?tab=account"
              className="tap-press shrink-0 rounded-md bg-amber-100/80 px-2 py-1 hover:bg-amber-200/80 dark:bg-amber-400/20 dark:hover:bg-amber-400/30"
            >
              Tasdiqlash
            </Link>
          </div>
        </div>
      )}

      <main className="marketplace-shell-content mx-auto flex w-full max-w-6xl flex-col gap-4 pl-[max(1rem,var(--app-content-safe-left))] pr-[max(1rem,var(--app-content-safe-right))] pt-4 md:py-6">
        {children}
      </main>

      <SupportWidget user={user} />

      {mobileActionBar ? (
        <MeasuredBottomBar
          key="marketplace-action-bar"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border surface-nav md:hidden"
        >
          <div className="mx-auto w-full max-w-6xl px-4 py-2.5 pb-[calc(0.625rem+var(--app-content-safe-bottom))]">
            {mobileActionBar}
          </div>
        </MeasuredBottomBar>
      ) : hideBottomNav ? null : (
        <MeasuredBottomBar
          key="marketplace-tab-bar"
          as="nav"
          aria-label="Pastki navigatsiya"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border surface-nav md:hidden"
        >
          <div
            className={cn(
              'mx-auto grid max-w-md px-1 pb-[var(--app-content-safe-bottom)]',
              items.length === 5 ? 'grid-cols-5' : 'grid-cols-4'
            )}
          >
            {items.map((item) => (
              <MobileNavLink key={item.id} item={item} active={item.id === activeTab} />
            ))}
          </div>
        </MeasuredBottomBar>
      )}
    </div>
  );
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  if (item.primary) {
    return (
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10.5px] font-semibold text-primary transition active:scale-95"
      >
        <span className="grid h-9 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-card-hover transition hover:brightness-110">
          {item.icon}
        </span>
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex min-h-14 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition active:scale-95',
        active ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'grid h-8 w-14 place-items-center rounded-full transition',
          active && 'bg-accent',
        )}
      >
        {item.icon}
      </span>
      {item.label}
    </Link>
  );
}
