'use client';

import { useEffect, useState } from 'react';
import { BadgeCheck, Coins, Gamepad2, ShieldCheck } from 'lucide-react';

import { ListingActions } from '@/components/marketplace/listing-actions';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import {
  divisionLabel,
  formatCompactNumber,
  formatListingDate,
  formatPriceUZS,
} from '@/lib/marketplace-format';
import {
  attributeBoolean,
  attributeNumber,
  attributeStringList,
  type ListingResponse,
} from '@/lib/marketplace-types';

interface MarketplaceListingDetailProps {
  listingId: string;
  authenticated: boolean;
}

export function MarketplaceListingDetail({
  listingId,
  authenticated,
}: MarketplaceListingDetailProps) {
  const [listing, setListing] = useState<ListingResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadListing() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(buildMarketplaceApiPath(['v1', 'listings', listingId]), {
          headers: { Accept: 'application/json' },
          credentials: 'include',
          signal: controller.signal,
        });
        const payload = await readJson(response);

        if (!response.ok) {
          setError(
            response.status === 404
              ? "E'lon topilmadi"
              : errorMessageFromPayload(payload, "E'lon yuklanmadi"),
          );
          setListing(null);
          return;
        }

        setListing(payload as ListingResponse);
      } catch (loadError) {
        if ((loadError as Error).name !== 'AbortError') {
          setError("E'lon yuklanmadi");
          setListing(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadListing();
    return () => controller.abort();
  }, [listingId]);

  if (loading) {
    return <EmptyState title="Yuklanmoqda..." body="E'lon ma'lumotlari olinmoqda." />;
  }

  if (error || !listing) {
    return <EmptyState title={error ?? "E'lon yuklanmadi"} body="Boshqa e'lonni ochib ko'ring." />;
  }

  const division = attributeNumber(listing, 'highest_division_level');
  const teamStrength = attributeNumber(listing, 'team_strength');
  const androidCoins = attributeNumber(listing, 'android_coins') ?? 0;
  const iosCoins = attributeNumber(listing, 'ios_coins') ?? 0;
  const hasGooglePlayLink = attributeBoolean(listing, 'has_google_play_link');
  const valuablePlayers = attributeStringList(listing, 'valuable_players');

  return (
    <article className="space-y-4">
      <div className="rounded-[8px] border border-white/10 bg-card/85 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-cyber-cyan">
              {divisionLabel(division)}
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
            authenticated={authenticated}
            initialLiked={listing.likedByMe}
            initialLikeCount={listing.likeCount}
          />
        </div>

        <Separator className="my-4" />

        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-300">
          {listing.description}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {listing.status === 'SOLD' && <Badge variant="warn">sotilgan</Badge>}
          {listing.priceNegotiable && <Badge variant="default">savdolashish</Badge>}
          {hasGooglePlayLink && (
            <Badge variant="muted">
              <BadgeCheck className="h-3 w-3" />
              Google linked
            </Badge>
          )}
          {valuablePlayers.map((player) => (
            <Badge key={player} variant="muted">
              {player}
            </Badge>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <DetailMetric
          icon={<ShieldCheck className="h-5 w-5" />}
          label="Division"
          value={division === undefined ? '-' : String(division)}
        />
        <DetailMetric
          icon={<Gamepad2 className="h-5 w-5" />}
          label="Team strength"
          value={teamStrength === undefined ? '-' : formatCompactNumber(teamStrength)}
        />
        <DetailMetric
          icon={<Coins className="h-5 w-5" />}
          label="Coins"
          value={formatCompactNumber(androidCoins + iosCoins)}
        />
      </div>
    </article>
  );
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return fallback;
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-[8px] border border-white/10 bg-card/80 px-4 py-12 text-center">
      <h2 className="text-base font-bold text-white">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
    </div>
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
