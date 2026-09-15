'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CheckCircle2, ExternalLink, PackageX, RotateCcw, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  adminDeleteListing,
  adminMarkListingSold,
  adminRestoreListing,
} from '@/lib/marketplace-actions';
import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import type { ListingResponse, ListingStatus } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface AdminListingsProps {
  listings: ListingResponse[];
  activeStatus?: ListingStatus;
  totalElements: number;
}

const FILTERS: Array<{ value: ListingStatus | 'all'; label: string }> = [
  { value: 'all', label: 'Hammasi' },
  { value: 'ACTIVE', label: 'Aktiv' },
  { value: 'SOLD', label: 'Sotilgan' },
  { value: 'DELETED', label: "O'chirilgan" },
];

const STATUS_BADGES: Record<ListingStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Aktiv', className: 'bg-emerald-100 text-emerald-800' },
  SOLD: { label: 'Sotilgan', className: 'bg-amber-100 text-amber-800' },
  DELETED: { label: "O'chirilgan", className: 'bg-destructive/10 text-destructive' },
};

export function AdminListings({ listings, activeStatus, totalElements }: AdminListingsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function act(listingId: string, action: 'delete' | 'restore' | 'sold') {
    if (action === 'delete' && !window.confirm("E'lon o'chirilsinmi? (keyin tiklash mumkin)")) {
      return;
    }
    if (action === 'sold' && !window.confirm("E'lon sotildi deb belgilansinmi?")) return;
    setBusyId(listingId);
    setError(null);
    startTransition(async () => {
      const result =
        action === 'delete'
          ? await adminDeleteListing(listingId)
          : action === 'sold'
            ? await adminMarkListingSold(listingId)
            : await adminRestoreListing(listingId);
      setBusyId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((filter) => {
            const isActive =
              filter.value === 'all' ? activeStatus === undefined : filter.value === activeStatus;
            return (
              <Link
                key={filter.value}
                href={`/admin/listings?status=${filter.value}`}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-sm font-semibold transition',
                  isActive
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {filter.label}
              </Link>
            );
          })}
        </nav>
        <p className="text-sm font-semibold text-muted-foreground">Jami: {totalElements}</p>
      </div>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {listings.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <PackageX className="h-8 w-8" />
          <p className="text-sm font-semibold">E&apos;lonlar yo&apos;q</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {listings.map((listing) => {
            const badge = STATUS_BADGES[listing.status];
            const busy = isPending && busyId === listing.id;
            return (
              <li
                key={listing.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 text-xs font-black uppercase tracking-wide',
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                    <span className="text-sm font-black text-primary">
                      {formatPriceUZS(listing.price)}
                    </span>
                    <time className="text-xs font-semibold text-muted-foreground">
                      {formatListingDate(listing.createdAt)}
                    </time>
                  </div>
                  <Link
                    href={`/marketplace/${listing.id}`}
                    className="inline-flex max-w-full items-center gap-1 text-sm font-medium text-foreground hover:text-primary"
                  >
                    <span className="line-clamp-1">{listing.description}</span>
                    <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  </Link>
                </div>

                <div className="flex flex-wrap gap-2">
                  {listing.status === 'ACTIVE' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => act(listing.id, 'sold')}
                    >
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                      {busy ? 'Saqlanmoqda…' : 'Sotildi deb belgilash'}
                    </Button>
                  )}
                  {listing.status === 'SOLD' && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => act(listing.id, 'restore')}
                    >
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      {busy ? 'Saqlanmoqda…' : "Qayta sotuvga qo'yish"}
                    </Button>
                  )}
                  {listing.status !== 'DELETED' ? (
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={isPending}
                      onClick={() => act(listing.id, 'delete')}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      O&apos;chirish
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPending}
                      onClick={() => act(listing.id, 'restore')}
                    >
                      <RotateCcw className="mr-1.5 h-4 w-4" />
                      Tiklash
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
