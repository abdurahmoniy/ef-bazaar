import Link from 'next/link';
import { Plus, Search, UserRound } from 'lucide-react';

import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { User } from '@/lib/types';

interface MarketplaceShellProps {
  user: User | null;
  children: React.ReactNode;
}

export function MarketplaceShell({ user, children }: MarketplaceShellProps) {
  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <Logo size="sm" href="/marketplace" />
          <div className="flex items-center gap-2">
            <Button asChild size="sm" className="h-9 rounded-lg px-3">
              <Link href="/marketplace/new">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Akkount joylash</span>
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 rounded-lg px-3">
              <Link href={user ? '/profile' : '/auth/login'}>
                <UserRound className="h-4 w-4" />
                <span className="max-w-28 truncate">{user ? user.displayName : 'Kirish'}</span>
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-4">
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 px-2 pb-[env(safe-area-inset-bottom)]">
          <MobileNavLink href="/marketplace" icon={<Search className="h-5 w-5" />} label="Bozor" />
          <MobileNavLink href="/marketplace/new" icon={<Plus className="h-5 w-5" />} label="Joylash" />
          <MobileNavLink href={user ? '/profile' : '/auth/login'} icon={<UserRound className="h-5 w-5" />} label="Profil" />
        </div>
      </nav>
    </div>
  );
}

function MobileNavLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground transition hover:text-primary',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
