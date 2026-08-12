import { MarketplaceHistoryProvider } from '@/components/marketplace/marketplace-history-provider';
import { MarketplaceNavigationProvider } from '@/components/marketplace/marketplace-navigation';

export default function MarketplaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketplaceHistoryProvider>
      <MarketplaceNavigationProvider>{children}</MarketplaceNavigationProvider>
    </MarketplaceHistoryProvider>
  );
}
