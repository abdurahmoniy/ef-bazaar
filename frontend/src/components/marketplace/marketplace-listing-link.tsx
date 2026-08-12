import Link from 'next/link';
import type { ReactNode } from 'react';

interface MarketplaceListingLinkProps {
  listingId: string;
  href: string;
  rawQuery?: string;
  className?: string;
  children: ReactNode;
}

/**
 * The feed's only listing-navigation boundary. Task 12 can add restoration
 * tracking here without coupling it to any of the card's visual layouts.
 */
export function MarketplaceListingLink({
  listingId,
  href,
  rawQuery = '',
  className,
  children,
}: MarketplaceListingLinkProps) {
  const query = rawQuery.replace(/^\?+/, '');
  const destination = query ? `${href}${href.includes('?') ? '&' : '?'}${query}` : href;

  return (
    <Link
      href={destination}
      className={className}
      data-marketplace-listing-link={listingId}
    >
      {children}
    </Link>
  );
}
