import { MarketplaceNavigationProvider } from '@/components/marketplace/marketplace-navigation';

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return <MarketplaceNavigationProvider>{children}</MarketplaceNavigationProvider>;
}
