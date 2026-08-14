'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ClipboardCheck,
  CreditCard,
  Flag,
  Inbox,
  LayoutDashboard,
  Mail,
  Package,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  UserCog,
  UsersRound,
} from 'lucide-react';

import { FEATURES } from '@/lib/feature-flags';
import { cn } from '@/lib/utils';

const TABS: Array<{ href: string; label: string; icon: React.ReactNode }> = [
  { href: '/admin', label: 'Statistika', icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: '/admin/reports', label: 'Shikoyatlar', icon: <Flag className="h-4 w-4" /> },
  { href: '/admin/trust', label: 'Trust', icon: <ShieldAlert className="h-4 w-4" /> },
  { href: '/admin/listings', label: "E'lonlar", icon: <Package className="h-4 w-4" /> },
  { href: '/admin/users', label: 'Foydalanuvchilar', icon: <UsersRound className="h-4 w-4" /> },
  { href: '/admin/trade-admin-applications', label: 'Admin arizalari', icon: <ClipboardCheck className="h-4 w-4" /> },
  { href: '/admin/mailboxes', label: 'Pochtalar', icon: <Mail className="h-4 w-4" /> },
  // The active check below is `startsWith`, so no `/admin/payments` parent
  // entry may be added — it would light up on both children. Sibling routes
  // are fine: neither `/cards` nor `/unmatched` is a prefix of the other.
  { href: '/admin/payments/cards', label: 'Kartalar', icon: <CreditCard className="h-4 w-4" /> },
  { href: '/admin/payments/unmatched', label: 'Tushumlar', icon: <Inbox className="h-4 w-4" /> },
  { href: '/admin/human-trades', label: 'Inson admin', icon: <UserCog className="h-4 w-4" /> },
  { href: '/admin/players', label: "O'yinchilar", icon: <Sparkles className="h-4 w-4" /> },
  { href: '/admin/attributes', label: 'Atributlar', icon: <SlidersHorizontal className="h-4 w-4" /> },
  // Human trade admin is closed for use; both of its tabs point at routes that
  // now answer 404. The entries stay here so turning FEATURES.humanAdmin back
  // on restores them in place rather than from memory.
].filter((tab) =>
  tab.href === '/admin/human-trades' || tab.href === '/admin/trade-admin-applications'
    ? FEATURES.humanAdmin
    : true,
);

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
