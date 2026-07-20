import Link from 'next/link';
import { BadgeCheck, IdCard, MessageCircle, ShieldAlert, Star } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { User } from '@/lib/types';

interface SellerCardProps {
  seller: Pick<
    User,
    'id' | 'displayName' | 'telegramPhotoUrl' | 'telegramUsername' | 'verified' | 'createdAt'
  > | null;
  isViewerOwner?: boolean;
  /** Trust module: seller is on the public blacklist — show the red warning. */
  blacklisted?: boolean;
}

export function SellerCard({ seller, isViewerOwner, blacklisted }: SellerCardProps) {
  if (!seller) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-card">
        Sotuvchi ma'lumotlari yuklanmadi.
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

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-card">
      {blacklisted && (
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          Bu sotuvchi qora ro'yxatda —{' '}
          <Link href="/blacklist" className="underline underline-offset-2">
            sababini ko'rish
          </Link>
        </div>
      )}
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sotuvchi</div>
      <div className="mt-3 flex items-start gap-3">
        <Avatar className="h-12 w-12 ring-2 ring-primary/10">
          {seller.telegramPhotoUrl && (
            <AvatarImage src={seller.telegramPhotoUrl} alt={seller.displayName} />
          )}
          <AvatarFallback className="text-sm font-bold">{initials}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-bold text-foreground">{seller.displayName}</p>
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
          <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Star className="h-3 w-3" /> A'zo: {memberSinceLabel}
            </span>
            <Link
              href={`/gamers/${seller.id}`}
              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
            >
              <IdCard className="h-3 w-3" /> Gamer Card
            </Link>
          </div>
        </div>
      </div>

      {!isViewerOwner && seller.telegramUsername && (
        <Button asChild variant="outline" size="sm" className="mt-3 w-full rounded-lg">
          <Link href={`https://t.me/${seller.telegramUsername}`} target="_blank" rel="noopener noreferrer">
            <MessageCircle className="h-4 w-4" />
            Telegramda yozish
          </Link>
        </Button>
      )}
    </div>
  );
}
