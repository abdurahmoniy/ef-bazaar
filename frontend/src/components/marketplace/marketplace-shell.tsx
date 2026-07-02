import Link from 'next/link';
import { Heart, Home, MessageCircle, Plus, Search, ShieldCheck, UserRound } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

interface MarketplaceShellProps {
  user: User | null;
  children: React.ReactNode;
  activeTab?: MarketplaceTab;
  /** Hides top-bar search — useful on the create form / profile edit flows. */
  hideSearch?: boolean;
  /** Current search text — populates the top-bar input on marketplace listing routes. */
  initialQuery?: string;
}

export type MarketplaceTab = 'home' | 'favorites' | 'sell' | 'chats' | 'profile';

interface NavItem {
  id: MarketplaceTab;
  href: string;
  label: string;
  icon: React.ReactNode;
  requiresAuth: boolean;
}

function buildNavItems(user: User | null): NavItem[] {
  return [
    { id: 'home', href: '/marketplace', label: 'Bozor', icon: <Home className="h-5 w-5" />, requiresAuth: false },
    {
      id: 'favorites',
      href: user ? '/favorites' : '/auth/login?from=/favorites',
      label: 'Sevimli',
      icon: <Heart className="h-5 w-5" />,
      requiresAuth: true,
    },
    { id: 'sell', href: '/marketplace/new', label: 'Sotish', icon: <Plus className="h-5 w-5" />, requiresAuth: true },
    {
      id: 'chats',
      href: user ? '/chats' : '/auth/login?from=/chats',
      label: 'Chatlar',
      icon: <MessageCircle className="h-5 w-5" />,
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

export function MarketplaceShell({
  user,
  children,
  activeTab = 'home',
  hideSearch = false,
  initialQuery,
}: MarketplaceShellProps) {
  const items = buildNavItems(user);

  return (
    <div className="min-h-app bg-background pb-24 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border surface-nav pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <Logo size="sm" href="/marketplace" />

          {!hideSearch && (
            <form action="/marketplace" method="get" className="ml-2 hidden flex-1 items-center sm:flex">
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

          <div className="ml-auto flex items-center gap-2">
            <Button asChild size="sm" className="hidden h-10 rounded-lg px-4 sm:inline-flex">
              <Link href={user ? '/marketplace/new' : '/auth/login?from=/marketplace/new'}>
                <Plus className="h-4 w-4" />
                <span>Sotish</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden h-10 rounded-lg px-3 sm:inline-flex">
              <Link href={user ? '/profile' : '/auth/login'}>
                <UserRound className="h-4 w-4" />
                <span className="max-w-32 truncate">{user ? user.displayName : 'Kirish'}</span>
              </Link>
            </Button>
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
          <div className="border-t border-border/70 bg-amber-50/70 text-amber-800">
            <div className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-1.5 text-[11px] font-semibold">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="flex-1 truncate">Akkount tasdiqlanmagan — Telegram va Google ulang</span>
              <Link href="/profile" className="shrink-0 rounded-md bg-white/60 px-2 py-0.5 hover:bg-white">
                Tasdiqlash
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-4 md:py-6">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border surface-nav md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-5 px-1 pb-[env(safe-area-inset-bottom)]">
          {items.map((item) => (
            <MobileNavLink key={item.id} item={item} active={item.id === activeTab} />
          ))}
        </div>
      </nav>
    </div>
  );
}

function MobileNavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex min-h-14 flex-col items-center justify-center gap-1 text-[10.5px] font-semibold transition',
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
