import Link from 'next/link';
import { Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MARKETPLACE_FILTERS, type MarketplaceFilterId } from '@/lib/marketplace-format';

interface ListingFiltersProps {
  activeFilter: MarketplaceFilterId;
  query?: string;
}

export function ListingFilters({ activeFilter, query }: ListingFiltersProps) {
  return (
    <div className="space-y-3">
      <form action="/marketplace" className="flex gap-2">
        {activeFilter !== 'all' && <input type="hidden" name="filter" value={activeFilter} />}
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={query}
            placeholder="Messi, Epic, Division..."
            className="h-10 rounded-lg pl-9"
          />
        </div>
        <Button type="submit" className="h-10 rounded-lg px-4">
          Qidirish
        </Button>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {MARKETPLACE_FILTERS.map((filter) => (
          <Link
            key={filter.id}
            href={filterHref(filter.id, query)}
            className={
              filter.id === activeFilter
                ? 'shrink-0 rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground'
                : 'shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground transition hover:border-primary/40 hover:text-foreground'
            }
          >
            {filter.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function filterHref(filterId: MarketplaceFilterId, query?: string) {
  const params = new URLSearchParams();
  if (filterId !== 'all') params.set('filter', filterId);
  if (query?.trim()) params.set('q', query.trim());
  const serialized = params.toString();
  return serialized ? `/marketplace?${serialized}` : '/marketplace';
}
