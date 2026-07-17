import Link from 'next/link';
import { CircleUser, CreditCard, Heart, MessageCircle, Package } from 'lucide-react';

import { cn } from '@/lib/utils';

export type ProfileTabId = 'listings' | 'chats' | 'favorites' | 'kartalar' | 'account';

interface ProfileTabsProps {
  active: ProfileTabId;
  counts?: Partial<Record<ProfileTabId, number>>;
}

const TABS: Array<{ id: ProfileTabId; label: string; icon: React.ReactNode }> = [
  { id: 'listings', label: "E'lonlarim", icon: <Package className="h-4 w-4" /> },
  { id: 'chats', label: 'Chatlar', icon: <MessageCircle className="h-4 w-4" /> },
  { id: 'favorites', label: 'Sevimli', icon: <Heart className="h-4 w-4" /> },
  { id: 'kartalar', label: 'Kartalar', icon: <CreditCard className="h-4 w-4" /> },
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
              href={`/profile?tab=${tab.id}`}
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
