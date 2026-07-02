import Link from 'next/link';
import { Package2, Plus } from 'lucide-react';

import { ListingCard } from '@/components/marketplace/listing-card';
import { Button } from '@/components/ui/button';
import type { ListingResponse } from '@/lib/marketplace-types';

interface ProfileListingsProps {
  listings: ListingResponse[];
  favorites?: boolean;
}

export function ProfileListings({ listings, favorites = false }: ProfileListingsProps) {
  if (listings.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card">
        <Package2 className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <h2 className="mt-2 text-sm font-bold text-foreground">
          {favorites ? "Sevimlilarga qo'shilganlar yo'q" : "Sizda hali e'lon yo'q"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {favorites
            ? "Bozorda yoqqan e'lonlarni yurakcha bilan belgilang."
            : 'Birinchi akkountingizni sotishga qo\'ying.'}
        </p>
        {!favorites && (
          <Button asChild size="sm" className="mt-3">
            <Link href="/marketplace/new">
              <Plus className="h-4 w-4" /> Akkount joylash
            </Link>
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  );
}
