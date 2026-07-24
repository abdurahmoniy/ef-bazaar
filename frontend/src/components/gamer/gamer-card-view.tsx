import {
  BadgeCheck,
  Gamepad2,
  Package,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Trophy,
} from 'lucide-react';

import { TIER_META, type GamerCardResponse } from '@/lib/gamer-types';
import { cn } from '@/lib/utils';

interface GamerCardViewProps {
  card: GamerCardResponse;
  /** id used by the PNG share button to find the capture root. */
  captureId?: string;
  /** Owner-only. Rendered under @username. Never pass on public /gamers/[id]. */
  email?: string | null;
}

function initialOf(name: string | null) {
  return (name?.trim()[0] || '?').toUpperCase();
}

/**
 * The Gamer Card — o'yinchining "raqamli pasporti". Server component: pure
 * markup, no state. PNG share captures the `captureId` element.
 */
export function GamerCardView({ card, captureId, email }: GamerCardViewProps) {
  const tier = TIER_META[card.tier];
  const memberSince = card.memberSince ? new Date(card.memberSince) : null;
  const memberLabel =
    memberSince && !Number.isNaN(memberSince.getTime())
      ? new Intl.DateTimeFormat('uz-UZ', { year: 'numeric', month: 'short' }).format(memberSince)
      : null;

  return (
    <div
      id={captureId}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-card"
    >
      {/* Tier banner */}
      <div className={cn('relative bg-gradient-to-r p-4 sm:p-5', tier.gradient)}>
        <div className="absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle_at_1px_1px,white_1px,transparent_0)] [background-size:14px_14px]" />
        <div className="relative flex items-center gap-3">
          <div
            className={cn(
              'flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-black/25 text-2xl font-black ring-2',
              tier.text,
              tier.ring,
            )}
          >
            {initialOf(card.displayName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={cn('truncate text-lg font-black', tier.text)}>
                {card.displayName ?? 'Noma\'lum o\'yinchi'}
              </p>
              {card.verified && <BadgeCheck className={cn('h-4 w-4 shrink-0', tier.text)} />}
            </div>
            <p className={cn('truncate text-xs opacity-80', tier.text)}>
              {card.telegramUsername ? `@${card.telegramUsername}` : ' '}
            </p>
            {email && (
              <p className={cn('truncate text-xs opacity-70', tier.text)}>{email}</p>
            )}
          </div>
          <div className="text-right">
            <div
              className={cn(
                'rounded-lg bg-black/25 px-2.5 py-1 text-[11px] font-black uppercase tracking-widest',
                tier.text,
              )}
            >
              {tier.label}
            </div>
            <p className={cn('mt-1 text-2xl font-black tabular-nums', tier.text)}>{card.elo}</p>
            <p className={cn('text-[10px] font-semibold uppercase opacity-80', tier.text)}>ELO</p>
          </div>
        </div>
      </div>

      {card.blacklisted && (
        <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Bu foydalanuvchi qora ro'yxatda — savdo qilishdan saqlaning!
        </div>
      )}

      {/* W/D/L + goals */}
      <div className="grid grid-cols-2 divide-x divide-border border-b border-border text-center sm:grid-cols-4 [&>*:nth-child(n+3)]:border-t sm:[&>*:nth-child(n+3)]:border-t-0">
        <Stat label="G'alaba" value={card.wins} className="text-emerald-600" />
        <Stat label="Durrang" value={card.draws} />
        <Stat label="Yutqazish" value={card.losses} className="text-red-500" />
        <Stat
          label="Win rate"
          value={card.winRatePercent == null ? '—' : `${card.winRatePercent}%`}
        />
      </div>

      {/* Trust row */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 p-4 text-sm sm:grid-cols-4">
        <TrustItem icon={<Trophy className="h-4 w-4" />} label="Turnirlar" value={card.tournaments} />
        <TrustItem
          icon={<Swords className="h-4 w-4" />}
          label="O'yinlar"
          value={`${card.matchesCount} (${card.goalsFor}:${card.goalsAgainst})`}
        />
        <TrustItem icon={<Package className="h-4 w-4" />} label="Sotgan" value={card.soldListings} />
        <TrustItem
          icon={<ShieldCheck className="h-4 w-4" />}
          label="Escrow olgan"
          value={card.escrowPurchases}
        />
      </div>

      {(card.bio || card.platform || card.highestDivision || card.favoriteTeam || memberLabel) && (
        <div className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          {card.bio && <p className="mb-1.5 text-[13px] text-foreground">{card.bio}</p>}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {card.platform && (
              <span className="inline-flex items-center gap-1">
                <Gamepad2 className="h-3 w-3" />
                {card.platform === 'BOTH' ? 'Android + iOS' : card.platform}
              </span>
            )}
            {card.highestDivision != null && <span>Divizion: {card.highestDivision}</span>}
            {card.favoriteTeam && <span>Jamoa: {card.favoriteTeam}</span>}
            {memberLabel && <span>A'zo: {memberLabel}</span>}
            <span className="ml-auto font-semibold text-primary">efbazaar.uz</span>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: number | string;
  className?: string;
}) {
  return (
    <div className="px-2 py-3">
      <p className={cn('text-xl font-black tabular-nums text-foreground', className)}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
    </div>
  );
}

function TrustItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-sm font-bold text-foreground">{value}</p>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
      </div>
    </div>
  );
}
