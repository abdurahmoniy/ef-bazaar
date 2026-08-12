import Link from 'next/link';
import {
  Home,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Trophy,
  UserRound,
} from 'lucide-react';

import { ChatsUnreadBadge } from '@/components/chat/chats-unread-badge';
import { Logo } from '@/components/brand/logo';
import { SlidingNav, type SlidingNavItem } from '@/components/navigation/sliding-nav';
import { TopBackButton } from '@/components/navigation/top-back-button';
import { UserMenu } from '@/components/navigation/user-menu';
import { NotificationBell } from '@/components/notifications/notification-bell';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

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
  /** Current search text — populates the top-bar input on marketplace listing routes. */
  initialQuery?: string;
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
}

export type MarketplaceTab = 'home' | 'tournaments' | 'safety' | 'sell' | 'chats' | 'profile';

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
 */
function buildNavItems(user: User | null): NavItem[] {
  return [
    { id: 'home', href: '/marketplace', label: 'Bozor', icon: <Home className="h-5 w-5" />, requiresAuth: false },
    {
      id: 'tournaments',
      href: '/tournaments',
      label: 'Turnirlar',
      icon: <Trophy className="h-5 w-5" />,
      requiresAuth: false,
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
      id: 'profile',
      href: user ? '/profile' : '/auth/login',
      label: user ? 'Profil' : 'Kirish',
      icon: <UserRound className="h-5 w-5" />,
      requiresAuth: false,
    },
  ];
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
  ];
}

export function MarketplaceShell({
  user,
  children,
  activeTab,
  hideSearch = false,
  initialQuery,
  backHref,
  backLabel,
  mobileActionBar,
}: MarketplaceShellProps) {
  const items = buildNavItems(user);
  const desktopLinks = buildDesktopLinks();

  return (
    <div
      className={cn(
        'min-h-app bg-background',
        mobileActionBar
          ? 'pb-[var(--marketplace-action-bar-reserve)]'
          : 'pb-[var(--marketplace-bottom-bar-height)]',
        'md:pb-0',
      )}
    >
      <header className="sticky top-0 z-40 border-b border-border surface-nav pt-[var(--app-content-safe-top)]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 sm:gap-3">
          {backHref && <TopBackButton href={backHref} label={backLabel} className="-ml-2" />}
          <Logo size="sm" href="/marketplace" />

          <SlidingNav
            items={desktopLinks}
            activeId={activeTab}
            variant="underline"
            markerName="header-nav-marker"
            ariaLabel="Asosiy navigatsiya"
            className="ml-1 hidden shrink-0 overflow-visible md:block"
          />

          {!hideSearch && (
            <form action="/marketplace" method="get" className="ml-2 hidden min-w-0 flex-1 items-center sm:flex">
              <div className="relative w-full">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={initialQuery}
                  placeholder="Akkount, Messi, Division..."
                  className="h-10 rounded-lg pl-9 pr-3"
                />
              </div>
            </form>
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
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
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

        {!hideSearch && (
          <div className="sm:hidden">
            <form action="/marketplace" method="get" className="px-4 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  name="q"
                  defaultValue={initialQuery}
                  placeholder="Qidiring..."
                  className="h-11 rounded-lg pl-9 pr-3"
                />
              </div>
            </form>
          </div>
        )}

        {user && !user.verified && (
          <div className="border-t border-border/70 bg-amber-50/70 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-1.5 text-[11px] font-semibold">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">
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
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:py-6">
        {children}
      </main>

      {mobileActionBar ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border surface-nav md:hidden">
          <div className="mx-auto w-full max-w-6xl px-4 py-2.5 pb-[calc(0.625rem+var(--app-content-safe-bottom))]">
            {mobileActionBar}
          </div>
        </div>
      ) : (
        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border surface-nav md:hidden">
          <div className="mx-auto grid max-w-md grid-cols-5 px-1 pb-[var(--app-content-safe-bottom)]">
            {items.map((item) => (
              <MobileNavLink key={item.id} item={item} active={item.id === activeTab} />
            ))}
          </div>
        </nav>
      )}
    </div>
  );
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  // The primary slot is a filled circle, not a fourth identical icon+label.
  // Five equal tabs left nothing marking the one action the marketplace exists
  // for; the raised puck is the standard tell and costs no extra bar height.
  if (item.primary) {
    return (
      <Link
        href={item.href}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        className="flex min-h-14 flex-col items-center justify-center gap-1 transition active:scale-95"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-card-hover transition hover:brightness-110">
          {item.icon}
        </span>
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
