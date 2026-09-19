'use client';

import Link, { useLinkStatus } from 'next/link';
import { Home, MessageCircle, Plus, Trophy, UserRound, Wallet } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';

import { ChatsUnreadBadge } from '@/components/chat/chats-unread-badge';
import { MeasuredBottomBar } from '@/components/marketplace/measured-bottom-bar';
import { LinkPendingIndicator } from '@/components/navigation/link-pending-indicator';
import { FEATURES } from '@/lib/feature-flags';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';

export type MarketplaceTab = 'home' | 'tournaments' | 'safety' | 'sell' | 'chats' | 'profile' | 'wallet';

interface NavItem {
  id: MarketplaceTab;
  href: string;
  label: string;
  icon: React.ReactNode;
  primary?: boolean;
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
// Page shells remount during navigation. Keep the last tab so the new marker
// can continue its movement across the marketplace and messenger layouts.
let lastActiveTab: MarketplaceTab | undefined;

function buildNavItems(user: User | null, sessionPending = false): NavItem[] {
  const items: NavItem[] = [
    { id: 'home', href: '/marketplace', label: 'Bozor', icon: <Home className="h-5 w-5" /> },
    { id: 'tournaments', href: '/tournaments', label: 'Turnirlar', icon: <Trophy className="h-5 w-5" /> },
    {
      id: 'chats',
      href: user || sessionPending ? '/chats' : '/auth/login?from=/chats',
      label: 'Chatlar',
      icon: <span className="relative"><MessageCircle className="h-5 w-5" />{user && <ChatsUnreadBadge viewerId={user.id} />}</span>,
    },
    { id: 'sell', href: '/marketplace/new', label: 'Sotish', icon: <Plus className="h-5 w-5" />, primary: true },
    { id: 'wallet', href: user || sessionPending ? '/hamyon' : '/auth/login?from=/hamyon', label: 'Hamyon', icon: <Wallet className="h-5 w-5" /> },
    { id: 'profile', href: user || sessionPending ? '/profile' : '/auth/login', label: user || sessionPending ? 'Profil' : 'Kirish', icon: <UserRound className="h-5 w-5" /> },
  ];
  return items.filter((item) => {
    if (item.id === 'tournaments') return FEATURES.tournaments;
    if (item.id === 'wallet') return FEATURES.wallet;
    return true;
  });
}

export function MobileBottomNav({
  user,
  activeTab,
  placement = 'fixed',
  sessionPending = false,
}: {
  user: User | null;
  activeTab?: MarketplaceTab;
  placement?: 'fixed' | 'inline';
  sessionPending?: boolean;
}) {
  const items = buildNavItems(user, sessionPending);
  const activeIndex = items.findIndex((item) => item.id === activeTab);
  const tabIds = items.map((item) => item.id).join(',');
  const markerRef = useRef<HTMLSpanElement>(null);

  useIsomorphicLayoutEffect(() => {
    if (activeIndex < 0) return;
    const previousIndex = tabIds.split(',').findIndex((id) => id === lastActiveTab);
    lastActiveTab = activeTab;
    if (previousIndex < 0 || previousIndex === activeIndex) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    markerRef.current?.animate?.(
      [
        { transform: `translateX(${previousIndex * 100}%)` },
        { transform: `translateX(${activeIndex * 100}%)` },
      ],
      { duration: 320, easing: 'cubic-bezier(.22,1,.36,1)' },
    );
  }, [activeIndex, activeTab, tabIds]);

  return (
    <MeasuredBottomBar
      as="nav"
      aria-label="Pastki navigatsiya"
      className={cn(
        'z-40 shrink-0 border-t border-border/70 surface-nav md:hidden',
        placement === 'fixed' ? 'fixed inset-x-0 bottom-0 pl-[var(--app-content-safe-left)] pr-[var(--app-content-safe-right)]' : 'relative',
      )}
    >
      <div className="mx-auto max-w-md px-1 pb-[var(--app-content-safe-bottom)]">
        <div className="relative grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {activeIndex >= 0 && (
            <span
              ref={markerRef}
              aria-hidden
              data-bottom-nav-marker
              className="pointer-events-none absolute left-0 top-[7px] flex justify-center"
              style={{ width: `${100 / items.length}%`, transform: `translateX(${activeIndex * 100}%)` }}
            >
              <span className="h-8 w-14 max-w-full rounded-full bg-primary/10 dark:bg-sky-400/15" />
            </span>
          )}
          {items.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              prefetch={false}
              aria-current={item.id === activeTab ? 'page' : undefined}
              className={cn(
                'relative flex h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl text-[10.5px] font-semibold leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-safe:active:scale-95',
                item.id === activeTab || item.primary ? 'text-primary dark:text-sky-300' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <TabContent item={item} />
            </Link>
          ))}
        </div>
      </div>
    </MeasuredBottomBar>
  );
}

function TabContent({ item }: { item: NavItem }) {
  const { pending } = useLinkStatus();
  return (
    <>
      <span className={cn('relative grid h-8 place-items-center rounded-full', item.primary ? 'w-11 bg-primary text-primary-foreground shadow-sm' : 'w-14')}>
        <span aria-hidden={pending || undefined} className={cn(pending && 'opacity-0')}>{item.icon}</span>
        <LinkPendingIndicator className="absolute inset-0" />
      </span>
      <span>{item.label}</span>
    </>
  );
}
