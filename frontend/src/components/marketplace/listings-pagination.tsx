import { ChevronLeft, ChevronRight } from 'lucide-react';

import { MarketplacePendingLink } from '@/components/marketplace/marketplace-navigation';
import { cn } from '@/lib/utils';

interface ListingsPaginationProps {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}

export function ListingsPagination({ page, totalPages, buildHref }: ListingsPaginationProps) {
  if (totalPages <= 1) return null;

  const pages = pageNumbers(page, totalPages);

  return (
    <nav className="pt-2" aria-label="Sahifalash">
      <div className="flex items-center justify-center gap-2 sm:hidden">
        <PageLink
          href={buildHref(Math.max(0, page - 1))}
          disabled={page === 0}
          label="Oldingi"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </PageLink>
        <span className="min-w-16 text-center text-sm font-bold text-foreground">
          {page + 1} / {totalPages}
        </span>
        <PageLink
          href={buildHref(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          label="Keyingi"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </PageLink>
      </div>

      <div className="hidden items-center justify-center gap-1 sm:flex">
        <PageLink
          href={buildHref(Math.max(0, page - 1))}
          disabled={page === 0}
          label="Oldingi"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </PageLink>
        {pages.map((entry, index) =>
          entry === 'ellipsis' ? (
            <span
              key={`ellipsis-${index}`}
              aria-hidden="true"
              className="px-2 text-sm text-muted-foreground"
            >
              …
            </span>
          ) : (
            <PageLink
              key={entry}
              href={buildHref(entry)}
              active={entry === page}
              label={`Sahifa ${entry + 1}`}
            >
              {entry + 1}
            </PageLink>
          ),
        )}
        <PageLink
          href={buildHref(Math.min(totalPages - 1, page + 1))}
          disabled={page >= totalPages - 1}
          label="Keyingi"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href,
  children,
  active,
  disabled,
  label,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  label: string;
}) {
  const className = cn(
    'inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-foreground hover:border-primary/40',
    disabled && 'pointer-events-none border-transparent bg-muted/60 text-muted-foreground',
  );

  if (disabled) {
    return (
      <span aria-disabled="true" aria-label={label} className={className}>
        {children}
      </span>
    );
  }

  return (
    <MarketplacePendingLink
      href={href}
      className={className}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
    >
      {children}
    </MarketplacePendingLink>
  );
}

function pageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  const windowSize = 1;
  const items = new Set<number>([0, total - 1, current]);
  for (let offset = 1; offset <= windowSize; offset += 1) {
    items.add(current - offset);
    items.add(current + offset);
  }
  const sorted = Array.from(items)
    .filter((page) => page >= 0 && page < total)
    .sort((a, b) => a - b);

  const result: (number | 'ellipsis')[] = [];
  let previous: number | null = null;
  for (const page of sorted) {
    if (previous !== null && page - previous > 1) result.push('ellipsis');
    result.push(page);
    previous = page;
  }
  return result;
}
