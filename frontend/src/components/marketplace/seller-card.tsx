import Link from 'next/link';
import { BadgeCheck, ChevronRight, MessageCircle, ShieldAlert, Star } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { SellerSummary } from '@/lib/marketplace-types';
import type { SellerRatingSummaryResponse } from '@/lib/trade-types';
import type { User } from '@/lib/types';

interface SellerCardProps {
  seller:
    | Pick<User, 'id' | 'displayName' | 'telegramPhotoUrl' | 'telegramUsername' | 'verified' | 'createdAt'>
    | SellerSummary
    | null;
  isViewerOwner?: boolean;
  /** Trust module: seller is on the public blacklist — show the red warning. */
  blacklisted?: boolean;
  /** Seller rating metrics from trade-service. */
  ratingSummary?: SellerRatingSummaryResponse | null;
}

export function SellerCard({
  seller,
  isViewerOwner,
  blacklisted,
  ratingSummary,
}: SellerCardProps) {
  if (!seller) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
        Sotuvchi ma&apos;lumotlari yuklanmadi.
      </div>
    );
  }

  const initials = (seller.displayName || 'U')
    .split(' ')
    .map((chunk) => chunk[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const memberSince = new Date(seller.createdAt);
  const memberSinceLabel = Number.isNaN(memberSince.getTime())
    ? '—'
    : `${memberSince.getFullYear()}`;

  const hasRatings = ratingSummary !== undefined && ratingSummary !== null && ratingSummary.ratingCount > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      {blacklisted && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:border-red-400/30 dark:bg-red-400/10 dark:text-red-200">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Bu sotuvchi qora ro&apos;yxatda —{' '}
          <Link href="/blacklist" className="underline underline-offset-2">
            sababini ko&apos;rish
          </Link>
        </div>
      )}
      <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wide text-muted-foreground">
        <span>Sotuvchi</span>
        <Link
          href={`/users/${seller.id}`}
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline lowercase tracking-normal"
        >
          profilga o&apos;tish <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      <Link
        href={`/users/${seller.id}`}
        className="group mt-3 flex items-start gap-3 rounded-lg p-1.5 -m-1.5 transition-colors hover:bg-muted/60"
        title={`${seller.displayName} profilini ko'rish`}
      >
        <Avatar className="h-12 w-12 ring-2 ring-primary/10 transition-transform group-hover:scale-105">
          {seller.telegramPhotoUrl && (
            <AvatarImage src={seller.telegramPhotoUrl} alt={seller.displayName} />
          )}
          <AvatarFallback className="text-sm font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-foreground transition-colors group-hover:text-primary">
              {seller.displayName}
            </p>
            {seller.verified ? (
              <Badge variant="verified" className="shrink-0">
                <BadgeCheck className="h-3 w-3" />
                tasdiqlangan
              </Badge>
            ) : (
              <Badge variant="warn" className="shrink-0">
                <ShieldAlert className="h-3 w-3" />
                tasdiqlanmagan
              </Badge>
            )}
          </div>
          {seller.telegramUsername && (
            <p className="mt-0.5 text-xs text-muted-foreground">@{seller.telegramUsername}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
            {hasRatings ? (
              <span className="inline-flex items-center gap-1 font-bold text-amber-600 dark:text-amber-400">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                <span>{ratingSummary.averageRating.toFixed(1)}</span>
                <span className="font-medium text-muted-foreground">({ratingSummary.ratingCount} baho)</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <Star className="h-3 w-3 text-muted-foreground" /> A&apos;zo: {memberSinceLabel}
              </span>
            )}
            {hasRatings && (
              <span>• A&apos;zo: {memberSinceLabel}</span>
            )}
          </div>
        </div>
      </Link>

      <div className="mt-3 flex items-center gap-2">
        <Button asChild variant="secondary" size="sm" className="flex-1 rounded-lg">
          <Link href={`/users/${seller.id}`}>Profilni ko&apos;rish</Link>
        </Button>
        {!isViewerOwner && seller.telegramUsername && (
          <Button asChild variant="outline" size="sm" className="shrink-0 rounded-lg px-3">
            <Link
              href={`https://t.me/${seller.telegramUsername}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Telegramda yozish"
            >
              <MessageCircle className="h-4 w-4" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}
