import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BadgeCheck, Coins, Gamepad2, ShieldCheck } from 'lucide-react';

import { ListingActions } from '@/components/marketplace/listing-actions';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ApiException } from '@/lib/api';
import { getMe } from '@/lib/auth';
import { isDebugVisibleApiEnabled } from '@/lib/debug-visible-api';
import { getListing } from '@/lib/marketplace';
import {
  divisionLabel,
  formatCompactNumber,
  formatListingDate,
  formatPriceUZS,
} from '@/lib/marketplace-format';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

interface ListingPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ListingPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Listing ${id.slice(0, 8)}`,
    robots: { index: false, follow: true },
  };
}

export default async function ListingPage({ params }: ListingPageProps) {
  const { id } = await params;
  const user = await resolveOptionalUser(getMe);

  let listing;
  try {
    listing = await getListing(id);
  } catch (error) {
    if (error instanceof ApiException && error.status === 404) notFound();
    throw error;
  }

  return (
    <MarketplaceShell user={user}>
      <article className="space-y-4">
        <div className="rounded-[8px] border border-white/10 bg-card/85 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-cyber-cyan">
                {divisionLabel(listing.highestDivisionLevel)}
              </p>
              <h1 className="mt-2 text-2xl font-black leading-tight text-white">
                {formatPriceUZS(listing.price)}
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatListingDate(listing.createdAt)}
              </p>
            </div>
            <ListingActions
              listingId={listing.id}
              authenticated={Boolean(user)}
              initialLiked={listing.likedByMe}
              initialLikeCount={listing.likeCount}
              visibleApiDebug={isDebugVisibleApiEnabled()}
            />
          </div>

          <Separator className="my-4" />

          <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">
            {listing.description}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {listing.status === 'SOLD' && <Badge variant="warn">sotilgan</Badge>}
            {listing.priceNegotiable && <Badge variant="default">savdolashish</Badge>}
            {listing.hasGooglePlayLink && (
              <Badge variant="muted">
                <BadgeCheck className="h-3 w-3" />
                Google linked
              </Badge>
            )}
            {listing.valuablePlayers.map((player) => (
              <Badge key={player} variant="muted">
                {player}
              </Badge>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <DetailMetric icon={<ShieldCheck className="h-5 w-5" />} label="Division" value={String(listing.highestDivisionLevel)} />
          <DetailMetric icon={<Gamepad2 className="h-5 w-5" />} label="Team strength" value={formatCompactNumber(listing.teamStrength)} />
          <DetailMetric icon={<Coins className="h-5 w-5" />} label="Coins" value={formatCompactNumber(listing.androidCoins + listing.iosCoins)} />
        </div>
      </article>
    </MarketplaceShell>
  );
}

function DetailMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-card/80 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      </div>
      <div className="mt-3 text-2xl font-black text-white">{value}</div>
    </div>
  );
}
