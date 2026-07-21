'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Flag, LayoutDashboard, Package, ShieldAlert, SlidersHorizontal, UsersRound } from 'lucide-react';

import { cn } from '@/lib/utils';

const TABS: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  { href: '/admin', label: 'Statistika', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/admin/reports', label: 'Shikoyatlar', icon: <Flag className="h-4 w-4" /> },
  { href: '/admin/trust', label: 'Trust', icon: <ShieldAlert className="h-4 w-4" /> },
  { href: '/admin/listings', label: "E'lonlar", icon: <Package className="h-4 w-4" /> },
  { href: '/admin/users', label: 'Foydalanuvchilar', icon: <UsersRound className="h-4 w-4" /> },
  { href: '/admin/attributes', label: 'Atributlar', icon: <SlidersHorizontal className="h-4 w-4" /> },
];

export function AdminTabs() {
  const pathname = usePathname();

  return (
    <nav className="overflow-x-auto no-scrollbar">
      <div className="flex min-w-max items-center gap-1 border-b border-border">
        {TABS.map((tab) => {
          const isActive =
            tab.href === '/admin' ? pathname === '/admin' : pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.icon}
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
