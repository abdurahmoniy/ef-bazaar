import Link from 'next/link';
import { BadgeCheck, Coins, Gamepad2, Heart, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import {
  divisionLabel,
  formatCompactNumber,
  formatListingDate,
  formatPriceUZS,
} from '@/lib/marketplace-format';
import type { ListingResponse } from '@/lib/marketplace-types';

interface ListingCardProps {
  listing: ListingResponse;
}

export function ListingCard({ listing }: ListingCardProps) {
  const title = listing.description.split('\n')[0]?.trim() || 'eFootball account';
  const preview = listing.description.replace(/\s+/g, ' ').slice(0, 120);
  const isSold = listing.status === 'SOLD';

  return (
    <article className="rounded-[8px] border border-white/10 bg-card/80 p-4 transition hover:border-cyber-cyan/45 hover:bg-white/[0.06]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={`/marketplace/${listing.id}`} className="block">
            <h2 className="line-clamp-2 text-base font-bold leading-snug text-white">
              {title}
            </h2>
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatListingDate(listing.createdAt)}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-black text-white">{formatPriceUZS(listing.price)}</div>
          {listing.priceNegotiable && (
            <div className="mt-1 text-xs font-semibold text-amber-300">savdolashish</div>
          )}
        </div>
      </div>

      <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-400">{preview}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
        <Metric icon={<ShieldCheck className="h-3.5 w-3.5" />} label="Division" value={divisionLabel(listing.highestDivisionLevel).replace('Division ', '')} />
        <Metric icon={<Gamepad2 className="h-3.5 w-3.5" />} label="Strength" value={formatCompactNumber(listing.teamStrength)} />
        <Metric icon={<Coins className="h-3.5 w-3.5" />} label="Coins" value={formatCompactNumber(listing.androidCoins + listing.iosCoins)} />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {isSold && <Badge variant="warn">sotilgan</Badge>}
        {listing.hasGooglePlayLink && (
          <Badge variant="muted">
            <BadgeCheck className="h-3 w-3" />
            Google
          </Badge>
        )}
        <Badge variant={listing.likedByMe ? 'default' : 'muted'}>
          <Heart className="h-3 w-3" />
          {formatCompactNumber(listing.likeCount)}
        </Badge>
        {listing.valuablePlayers.slice(0, 4).map((player) => (
          <Badge key={player} variant="muted">
            {player}
          </Badge>
        ))}
      </div>
    </article>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-2">
      <div className="flex items-center gap-1 text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-1 truncate font-black text-white">{value}</div>
    </div>
  );
}
