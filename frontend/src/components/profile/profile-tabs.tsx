import Link from 'next/link';
import { CircleUser, CreditCard, Heart, IdCard, Mail, Package } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ProfileTabId = 'listings' | 'favorites' | 'kartalar' | 'gamer' | 'pochta' | 'account';

interface ProfileTabsProps {
  active: ProfileTabId;
  counts?: Partial<Record<ProfileTabId, number>>;
}

// "Pochta" is a direct link to the /mail route (not a ?tab= query param) —
// the webmail view has its own two-column layout and doesn't share the
// profile shell. We keep it in the tab bar for discoverability.
// Chats intentionally have no tab: the shell header button and the header
// stats strip already link to /chats.
const TABS: Array<{ id: ProfileTabId; label: string; icon: React.ReactNode; href?: string }> = [
  { id: 'listings', label: "E'lonlarim", icon: <Package className="h-4 w-4" /> },
  { id: 'favorites', label: 'Sevimli', icon: <Heart className="h-4 w-4" /> },
  { id: 'kartalar', label: 'Kartalar', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'gamer', label: 'Gamer Card', icon: <IdCard className="h-4 w-4" /> },
  { id: 'pochta', label: 'Pochta', icon: <Mail className="h-4 w-4" />, href: '/mail' },
  { id: 'account', label: 'Akkount', icon: <CircleUser className="h-4 w-4" /> },
];

export function ProfileTabs({ active, counts = {} }: ProfileTabsProps) {
  return (
    <nav className="-mx-4 overflow-x-auto px-4 no-scrollbar sm:mx-0 sm:px-0">
      <div className="inline-flex min-w-max items-center gap-1 rounded-xl border border-border bg-card p-1 shadow-sm">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          const count = counts[tab.id];
          return (
            <Link
              key={tab.id}
              href={tab.href ?? `/profile?tab=${tab.id}`}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition sm:px-3.5',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {tab.icon}
              {tab.label}
              {typeof count === 'number' && count > 0 && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black',
                    isActive ? 'bg-white/20 text-primary-foreground' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
