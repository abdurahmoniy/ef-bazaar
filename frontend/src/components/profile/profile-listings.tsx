import Link from 'next/link';
import { Package2, Plus } from 'lucide-react';

import { ListingCard } from '@/components/marketplace/listing-card';
import { ListingOwnerActions } from '@/components/profile/listing-owner-actions';
import { Button } from '@/components/ui/button';
import type { ListingResponse } from '@/lib/marketplace-types';

interface ProfileListingsProps {
  listings: ListingResponse[];
  favorites?: boolean;
}

export function ProfileListings({ listings, favorites = false }: ProfileListingsProps) {
  if (listings.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/80 bg-card px-4 py-16 text-center shadow-xs min-h-[50vh] flex flex-col items-center justify-center">
        <div className="grid h-16 w-16 place-items-center rounded-3xl bg-muted/50 text-muted-foreground ring-1 ring-border/50">
          <Package2 className="h-8 w-8 opacity-60" />
        </div>
        <h2 className="mt-3 text-base font-bold text-foreground">
          {favorites ? "Sevimlilarga qo'shilganlar yo'q" : "Sizda hali e'lon yo'q"}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground max-w-xs leading-relaxed">
          {favorites
            ? "Bozorda yoqqan e'lonlarni yurakcha bilan belgilang."
            : "Birinchi akkountingizni sotuvga qo'ying."}
        </p>
        {!favorites && (
          <Button asChild size="sm" className="mt-4 rounded-full px-5 font-semibold shadow-xs">
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
      {listings.map((listing) =>
        favorites ? (
          <ListingCard key={listing.id} listing={listing} />
        ) : (
          <div key={listing.id} className="flex flex-col gap-2">
            <ListingCard listing={listing} />
            <ListingOwnerActions listingId={listing.id} />
          </div>
        ),
      )}
    </div>
  );
}
