import { CircleUser, CreditCard, Handshake, Heart, Package } from 'lucide-react';

import { SlidingNav, type SlidingNavItem } from '@/components/navigation/sliding-nav';

export type ProfileTabId = 'listings' | 'trades' | 'favorites' | 'kartalar' | 'account';

interface ProfileTabsProps {
  active: ProfileTabId;
  counts?: Partial<Record<ProfileTabId, number>>;
}

// "Pochta" used to sit here as a direct /mail link. A tab that navigates out of
// its own tab set — different layout, different app — is a broken promise, so
// it moved to the user menu. Chats have no tab either: the header icon and the
// stats strip both link to /chats.
const TABS: Array<Omit<SlidingNavItem, 'href'> & { id: ProfileTabId }> = [
  { id: 'listings', label: "E'lonlarim", icon: <Package className="h-4 w-4" /> },
  { id: 'trades', label: 'Savdolarim', icon: <Handshake className="h-4 w-4" /> },
  { id: 'favorites', label: 'Sevimli', icon: <Heart className="h-4 w-4" /> },
  { id: 'kartalar', label: 'Kartalar', icon: <CreditCard className="h-4 w-4" /> },
  { id: 'account', label: 'Akkount', icon: <CircleUser className="h-4 w-4" /> },
];

export function ProfileTabs({ active, counts = {} }: ProfileTabsProps) {
  const items: SlidingNavItem[] = TABS.map((tab) => ({
    ...tab,
    href: `/profile?tab=${tab.id}`,
    count: counts[tab.id],
  }));

  return (
    <SlidingNav
      items={items}
      activeId={active}
      markerName="profile-tabs-marker"
      collapseInactiveLabels
      fullWidthOnMobile
      ariaLabel="Profil bo'limlari"
    />
  );
}
