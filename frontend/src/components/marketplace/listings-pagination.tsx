import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
    <nav className="flex flex-wrap items-center justify-center gap-1 pt-2" aria-label="Sahifalash">
      <PageLink href={buildHref(Math.max(0, page - 1))} disabled={page === 0} label="Oldingi" edge>
        <ChevronLeft className="h-4 w-4" />
      </PageLink>
      {pages.map((entry, index) =>
        entry === 'ellipsis' ? (
          <span key={`ellipsis-${index}`} className="px-2 text-sm text-muted-foreground">
            …
          </span>
        ) : (
          <PageLink key={entry} href={buildHref(entry)} active={entry === page} label={`Sahifa ${entry + 1}`}>
            {entry + 1}
          </PageLink>
        ),
      )}
      <PageLink
        href={buildHref(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        label="Keyingi"
        edge
      >
        <ChevronRight className="h-4 w-4" />
      </PageLink>
    </nav>
  );
}

function PageLink({
  href,
  children,
  active,
  disabled,
  edge,
  label,
}: {
  href: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  edge?: boolean;
  label: string;
}) {
  const className = cn(
    'inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition',
    active
      ? 'border-primary bg-primary text-primary-foreground'
      : 'border-border bg-card text-foreground hover:border-primary/40',
    disabled && 'pointer-events-none border-transparent bg-muted/60 text-muted-foreground',
    edge && 'px-2',
  );

  if (disabled) {
    return (
      <span aria-disabled className={className} title={label}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={className} title={label}>
      {children}
    </Link>
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
