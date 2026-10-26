import Link from 'next/link';
import { Activity, Circle, Clock3, Star, UserRound, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import { formatDurationUz } from '@/lib/trade-human';
import type { TradeAdminCardResponse, TradeAdminProfileResponse } from '@/lib/trade-types';
import { cn } from '@/lib/utils';

type AdminLike = TradeAdminCardResponse | TradeAdminProfileResponse;

function displayName(admin: AdminLike) {
  return admin.displayName?.trim() || 'Ismi ko\'rsatilmagan admin';
}

function feeLabel(admin: AdminLike) {
  return `${formatPriceUZS(admin.minFeeUzs)} - ${formatPriceUZS(admin.maxFeeUzs)}`;
}

function averageWorkLabel(seconds: number | null) {
  return seconds ? formatDurationUz(seconds) : 'Hali yo\'q';
}

export function TradeAdminCard({
  admin,
  selected = false,
  action,
  href,
  compact = false,
}: {
  admin: TradeAdminCardResponse;
  selected?: boolean;
  action?: React.ReactNode;
  href?: string;
  compact?: boolean;
}) {
  const body = (
    <div
      className={cn(
        'flex h-full flex-col gap-3 rounded-lg border bg-card p-3 shadow-card transition',
        selected ? 'border-primary ring-2 ring-primary/15' : 'border-border',
        admin.busy && 'opacity-60 grayscale',
        href && 'hover:border-primary/40 hover:shadow-card-hover',
      )}
    >
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
          <UserRound className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-sm font-black text-foreground">{displayName(admin)}</h3>
            {admin.online ? (
              <Badge variant="info" className="px-2 py-0 text-[10px]">
                <Circle className="h-2 w-2 fill-current" />
                online
              </Badge>
            ) : admin.lastSeenAt ? (
              <Badge variant="muted" className="px-2 py-0 text-[10px]">
                {formatListingDate(admin.lastSeenAt)}
              </Badge>
            ) : null}
            {admin.busy && (
              <Badge variant="warn" className="px-2 py-0 text-[10px]">
                Band
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs font-semibold text-muted-foreground">
            {feeLabel(admin)}
          </p>
        </div>
      </div>

      <div className={cn('grid gap-2 text-xs', compact ? 'grid-cols-2' : 'grid-cols-3')}>
        <div className="rounded-lg bg-muted/40 p-2">
          <p className="flex items-center gap-1 font-bold text-foreground">
            <Star className="h-3.5 w-3.5 text-warning" />
            {admin.averageStars ? admin.averageStars.toFixed(1) : 'Yangi'}
          </p>
          <p className="text-[10.5px] text-muted-foreground">{admin.ratingCount} baho</p>
        </div>
        <div className="rounded-lg bg-muted/40 p-2">
          <p className="flex items-center gap-1 font-bold text-foreground">
            <Activity className="h-3.5 w-3.5" />
            {admin.activeTrades}/{admin.maxConcurrentTrades}
          </p>
          <p className="text-[10.5px] text-muted-foreground">aktiv savdo</p>
        </div>
        {!compact && (
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="flex items-center gap-1 font-bold text-foreground">
              <Clock3 className="h-3.5 w-3.5" />
              {averageWorkLabel(admin.averageWorkSeconds)}
            </p>
            <p className="text-[10.5px] text-muted-foreground">o'rtacha vaqt</p>
          </div>
        )}
      </div>

      {action && <div className="mt-auto">{action}</div>}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {body}
      </Link>
    );
  }

  return body;
}

export function TradeAdminTrustStats({
  profile,
}: {
  profile: TradeAdminProfileResponse;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <TrustStat
        label="Reyting"
        value={profile.averageStars ? profile.averageStars.toFixed(1) : 'Yangi'}
        sub={`${profile.ratingCount} baho`}
      />
      <TrustStat label="Yakunlangan" value={profile.completedCount} sub="muvaffaqiyatli" />
      <TrustStat
        label="Tashlab ketgan"
        value={profile.abandonedCount}
        sub="eskalatsiya"
        danger={profile.abandonedCount > 0}
      />
      <TrustStat
        label="Bekor qilgan"
        value={profile.cancelledCount}
        sub="admin bekori"
        danger={profile.cancelledCount > 0}
      />
    </div>
  );
}

function TrustStat({
  label,
  value,
  sub,
  danger = false,
}: {
  label: string;
  value: React.ReactNode;
  sub: string;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3',
        danger ? 'border-destructive/25 bg-destructive/5' : 'border-border',
      )}
    >
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn('mt-1 text-lg font-black', danger ? 'text-destructive' : 'text-foreground')}>
        {value}
      </p>
      <p className="text-[10.5px] text-muted-foreground">{sub}</p>
    </div>
  );
}

export function InactiveAdminNotice() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-xs text-destructive">
      <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>Bu admin hozir katalogda faol emas yoki buyurtma qabul qilmayapti.</p>
    </div>
  );
}
