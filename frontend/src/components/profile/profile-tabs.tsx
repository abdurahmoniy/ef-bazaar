import Link from 'next/link';
import { CircleUser, CreditCard, Heart, Mail, MessageCircle, Package } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ProfileTabId = 'listings' | 'chats' | 'favorites' | 'kartalar' | 'pochta' | 'account';

interface ProfileTabsProps {
  active: ProfileTabId;
  counts?: Partial<Record<ProfileTabId, number>>;
}

// "Pochta" is a direct link to the /mail route (not a ?tab= query param) —
// the webmail view has its own two-column layout and doesn't share the
// profile shell. We keep it in the tab bar for discoverability.
const TABS: Array<{ id: ProfileTabId; label: string; icon: React.ReactNode; href?: string }> = [
  { id: 'listings', label: "E'lonlarim", icon: <Package className="h-4 w-4" /> },
  { id: 'chats', label: 'Chatlar', icon: <MessageCircle className="h-4 w-4" /> },
  { id: 'favorites', label: 'Sevimli', icon: <Heart className="h-4 w-4" /> },
  { id: 'kartalar', label: 'Kartalar', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'pochta', label: 'Pochta', icon: <Mail className="h-4 w-4" />, href: '/mail' },
  { id: 'account', label: 'Akkount', icon: <CircleUser className="h-4 w-4" /> },
];

export function ProfileTabs({ active, counts = {} }: ProfileTabsProps) {
  return (
    <nav className="overflow-x-auto no-scrollbar">
      <div className="flex min-w-max items-center gap-1 border-b border-border">
        {TABS.map((tab) => {
          const isActive = tab.id === active;
          const count = counts[tab.id];
          return (
            <Link
              key={tab.id}
              href={tab.href ?? `/profile?tab=${tab.id}`}
              className={cn(
                'inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition',
                isActive
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.icon}
              {tab.label}
              {typeof count === 'number' && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-black',
                    isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
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
