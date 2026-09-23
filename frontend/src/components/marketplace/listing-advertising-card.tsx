import Link from 'next/link';
import { ArrowRight, Megaphone } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { listingAdvertisingHref } from '@/lib/listing-advertising';

export function ListingAdvertisingCard({ listingId }: { listingId: string }) {
  return (
    <section className="rounded-xl border border-primary/20 bg-primary/5 p-4 dark:border-secondary/25 dark:bg-secondary/5 sm:flex sm:items-center sm:justify-between sm:gap-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary dark:bg-secondary/10 dark:text-secondary">
          <Megaphone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-sm font-bold text-foreground sm:text-base">Ko‘proq xaridorga yetib boring</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Telegram kanallarida reklama — ixtiyoriy. E’loningiz reklamasiz ham bozorda ko‘rinadi.
          </p>
        </div>
      </div>
      <Button asChild variant="outline" className="mt-3 min-h-11 w-full shrink-0 sm:mt-0 sm:w-auto">
        <Link href={listingAdvertisingHref(listingId)}>
          Kanallarni tanlash <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </Button>
    </section>
  );
}
