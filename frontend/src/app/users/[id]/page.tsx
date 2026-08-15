import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  CheckCircle2,
  ExternalLink,
  Gamepad2,
  MessageCircle,
  Package,
  ShieldAlert,
  Star,
  Trophy,
  UserCheck,
} from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/marketplace/listing-card';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { getGamerCard, isUserBlacklisted } from '@/lib/gamer-server';
import { getUserListings } from '@/lib/marketplace-server';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface UserPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: UserPageProps): Promise<Metadata> {
  const { id } = await params;
  const card = await getGamerCard(id);
  const name = card?.displayName || 'Foydalanuvchi';
  return {
    title: `${name} — Profil`,
    description: card?.bio || `${name} ning EfBazaar dagi profili va e'lonlari`,
  };
}

export default async function UserProfilePage({ params }: UserPageProps) {
  const { id } = await params;

  const [card, listings, viewer, blacklisted] = await Promise.all([
    getGamerCard(id),
    getUserListings(id),
    resolveOptionalUser(getMe),
    isUserBlacklisted(id),
  ]);

  if (!card && listings.length === 0) {
    notFound();
  }

  const isOwner = viewer?.id === id;
  const displayName = card?.displayName || (listings[0]?.seller?.displayName ?? 'Foydalanuvchi');
  const telegramUsername = card?.telegramUsername || (listings[0]?.seller?.telegramUsername ?? null);
  const isVerified = card?.verified ?? (listings[0]?.seller?.verified ?? false);

  const initials = displayName
    .split(' ')
    .map((chunk) => chunk[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  const memberSince = card?.memberSince ? new Date(card.memberSince) : null;
  const memberSinceYear = memberSince && !Number.isNaN(memberSince.getTime())
    ? `${memberSince.getFullYear()}`
    : '2025';

  const photoUrl = card?.photoAvailable
    ? `/api/auth/v1/users/${id}/photo`
    : (listings[0]?.seller?.telegramPhotoUrl ?? null);

  const activeListings = listings.filter((l) => l.status === 'ACTIVE');
  const soldListings = listings.filter((l) => l.status === 'SOLD');

  return (
    <MarketplaceShell user={viewer} activeTab="home" backHref="/marketplace" backLabel="Bozor">
      <div className="mx-auto w-full max-w-4xl space-y-6 pb-20">
        {/* Blacklist Warning */}
        {blacklisted && (
          <div className="flex items-center gap-3 rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-950/40 dark:text-red-200">
            <ShieldAlert className="h-5 w-5 shrink-0 text-red-600" />
            <div className="flex-1">
              <span>Ushbu foydalanuvchi qora ro&apos;yxatga kiritilgan.</span>{' '}
              <Link href="/blacklist" className="underline underline-offset-2">
                Batafsil ma&apos;lumot
              </Link>
            </div>
          </div>
        )}

        {/* Profile Card Header */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
              <Avatar className="h-20 w-20 ring-4 ring-primary/10 sm:h-24 sm:w-24">
                {photoUrl && <AvatarImage src={photoUrl} alt={displayName} />}
                <AvatarFallback className="text-2xl font-black">{initials}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
                  <h1 className="text-xl font-black text-foreground sm:text-2xl">{displayName}</h1>
                  {isVerified ? (
                    <Badge variant="verified" className="shrink-0">
                      <BadgeCheck className="h-3.5 w-3.5" />
                      tasdiqlangan
                    </Badge>
                  ) : (
                    <Badge variant="warn" className="shrink-0">
                      <ShieldAlert className="h-3.5 w-3.5" />
                      tasdiqlanmagan
                    </Badge>
                  )}
                  {isOwner && (
                    <Badge variant="muted" className="shrink-0">
                      <UserCheck className="h-3.5 w-3.5" />
                      Sizning profilingiz
                    </Badge>
                  )}
                </div>

                {telegramUsername && (
                  <p className="text-sm font-medium text-muted-foreground">
                    @{telegramUsername}
                  </p>
                )}

                {card?.bio && (
                  <p className="max-w-md text-xs text-foreground/90 sm:text-sm">
                    {card.bio}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-1 text-xs text-muted-foreground sm:justify-start">
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 text-amber-500" /> A&apos;zo: {memberSinceYear}-yildan
                  </span>
                  {card?.favoriteTeam && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      ⚽ {card.favoriteTeam}
                    </span>
                  )}
                  {card?.platform && (
                    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                      {card.platform}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-center gap-2 sm:flex-col sm:items-end">
              {isOwner ? (
                <Button asChild className="rounded-xl">
                  <Link href="/profile">
                    Profilimni boshqarish
                  </Link>
                </Button>
              ) : telegramUsername ? (
                <Button asChild size="lg" className="rounded-xl">
                  <Link
                    href={`https://t.me/${telegramUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="h-4 w-4" />
                    Telegramda yozish
                  </Link>
                </Button>
              ) : null}

              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link href={`/gamers/${id}`}>
                  <Gamepad2 className="h-4 w-4" />
                  Gamer Card
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
              </Button>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-4">
            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <Package className="h-3.5 w-3.5 text-primary" /> Faol e&apos;lonlar
              </div>
              <div className="mt-1 text-lg font-black text-foreground">
                {card?.activeListings ?? activeListings.length}
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Sotilgan
              </div>
              <div className="mt-1 text-lg font-black text-emerald-600 dark:text-emerald-400">
                {card?.soldListings ?? soldListings.length}
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <Trophy className="h-3.5 w-3.5 text-amber-500" /> ELO reyting
              </div>
              <div className="mt-1 text-lg font-black text-foreground">
                {card?.elo ?? 1000}{' '}
                {card?.tier && (
                  <span className="text-xs font-bold uppercase text-primary">
                    ({card.tier})
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <Gamepad2 className="h-3.5 w-3.5 text-blue-500" /> G&apos;alabalar
              </div>
              <div className="mt-1 text-lg font-black text-foreground">
                {card?.winRatePercent != null ? `${card.winRatePercent}%` : '—'}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  ({card?.matchesCount ?? 0} o&apos;yin)
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* User's Listings Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-black text-foreground sm:text-xl">
                Sotuvchining e&apos;lonlari
              </h2>
              <p className="text-xs text-muted-foreground">
                {activeListings.length} ta faol, {soldListings.length} ta sotilgan e&apos;lon
              </p>
            </div>
          </div>

          {listings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
              <Package className="mx-auto h-10 w-10 text-muted-foreground/50" />
              <h3 className="mt-3 text-sm font-bold text-foreground">
                Hozircha e&apos;lonlar yo&apos;q
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Bu foydalanuvchi hali faol e&apos;lon joylashtirmagan.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {listings.map((entry) => (
                <ListingCard key={entry.id} listing={entry} />
              ))}
            </div>
          )}
        </section>
      </div>
    </MarketplaceShell>
  );
}
