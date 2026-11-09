import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  BadgeCheck,
  Calendar,
  CheckCircle2,
  Layers,
  MessageSquare,
  Package,
  ShieldAlert,
  ShieldCheck,
  Star,
  UserCheck,
} from 'lucide-react';

import { ProfileAppearance } from '@/components/profile/profile-appearance';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListingCard } from '@/components/marketplace/listing-card';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { getGamerCard, isUserBlacklisted } from '@/lib/gamer-server';
import { getUserListings } from '@/lib/marketplace-server';
import { getSellerRatings, getSellerRatingSummary } from '@/lib/trade-server';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { formatListingDate } from '@/lib/marketplace-format';

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
    description: `${name} ning EfBazaar dagi profili va e'lonlari`,
  };
}

export default async function UserProfilePage({ params }: UserPageProps) {
  const { id } = await params;

  const [card, listings, viewer, blacklisted, ratingSummary, sellerRatings] = await Promise.all([
    getGamerCard(id),
    getUserListings(id),
    resolveOptionalUser(getMe),
    isUserBlacklisted(id),
    getSellerRatingSummary(id),
    getSellerRatings(id),
  ]);

  if (!card && listings.length === 0 && !ratingSummary) {
    notFound();
  }

  const isOwner = viewer?.id === id;
  const displayName = card?.displayName || (listings[0]?.seller?.displayName ?? 'Foydalanuvchi');
  // Username faqat egasiga: boshqalarga u xaridorni chatdan tashqariga, garovsiz
  // savdoga olib ketadi. API ham faqat egasiga qaytaradi — bu ikkinchi qavat.
  const telegramUsername = isOwner ? card?.telegramUsername ?? null : null;
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
  const hasRatings = ratingSummary && ratingSummary.ratingCount > 0;

  return (
    <MarketplaceShell user={viewer} activeTab="home" backHref="/marketplace" backLabel="Bozor">
      <div className="mx-auto w-full max-w-4xl space-y-6 pb-20">
        {/* Blacklist Warning */}
        {blacklisted && (
          <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-destructive">
            <ShieldAlert className="h-5 w-5 shrink-0 text-destructive" />
            <div className="flex-1">
              <span>Ushbu foydalanuvchi qora ro&apos;yxatga kiritilgan.</span>{' '}
              <Link href="/blacklist" className="underline underline-offset-2">
                Batafsil ma&apos;lumot
              </Link>
            </div>
          </div>
        )}

        {/* Profile Header */}
        <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card sm:p-6">
          <ProfileAppearance userId={id} />
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
              <Avatar className="h-20 w-20 ring-4 ring-primary/10 sm:h-24 sm:w-24">
                {photoUrl && <AvatarImage src={photoUrl} alt={displayName} />}
                <AvatarFallback className="text-2xl font-black">{initials}</AvatarFallback>
              </Avatar>

              <div className="min-w-0 space-y-2">
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
                  <p className="text-sm font-semibold text-primary">
                    @{telegramUsername}
                  </p>
                )}

                <div className="flex flex-wrap items-center justify-center gap-3 pt-0.5 text-xs text-muted-foreground sm:justify-start">
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" /> A&apos;zo: {memberSinceYear}-yildan
                  </span>
                  <span className="inline-flex items-center gap-1 text-success font-medium">
                    <ShieldCheck className="h-3.5 w-3.5" /> Xavfsiz bitimlar
                  </span>
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
              ) : null}
            </div>
          </div>

          {/* Marketplace Stats Grid */}
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border pt-4 sm:grid-cols-5">
            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" /> Reyting
              </div>
              <div className="mt-1 flex items-baseline justify-center sm:justify-start gap-1">
                <span className="text-lg font-black text-foreground">
                  {hasRatings ? ratingSummary.averageRating.toFixed(1) : '—'}
                </span>
                {hasRatings && (
                  <span className="text-xs text-muted-foreground font-semibold">
                    ({ratingSummary.ratingCount})
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <Package className="h-3.5 w-3.5 text-primary" /> Faol e&apos;lonlar
              </div>
              <div className="mt-1 text-lg font-black text-foreground">
                {activeListings.length}
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <CheckCircle2 className="h-3.5 w-3.5 text-success" /> Sotilgan
              </div>
              <div className="mt-1 text-lg font-black text-success">
                {soldListings.length}
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <Layers className="h-3.5 w-3.5 text-info" /> Jami e&apos;lonlar
              </div>
              <div className="mt-1 text-lg font-black text-foreground">
                {listings.length}
              </div>
            </div>

            <div className="rounded-xl bg-muted/40 p-3 text-center sm:text-left">
              <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-muted-foreground sm:justify-start">
                <ShieldCheck className="h-3.5 w-3.5 text-success" /> Kafolat
              </div>
              <div className="mt-1 text-xs font-bold text-success">
                100% Xavfsiz
              </div>
            </div>
          </div>
        </section>

        {/* Safe Trade Notice */}
        <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-xs font-medium text-foreground/90">
          <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
          <span>
            Barcha savdolar <b>EfBazaar Kafillik tizimi</b> orqali amalga oshiriladi. Hisob tekshirilib qabul qilinmaguncha to&apos;lov sotuvchiga o&apos;tkazilmaydi.
          </span>
        </div>

        {/* User's Listings Section */}
        <section className="space-y-6">
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
            <>
              {activeListings.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-foreground sm:text-lg">
                      Faol e&apos;lonlar ({activeListings.length})
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {activeListings.map((entry) => (
                      <ListingCard key={entry.id} listing={entry} />
                    ))}
                  </div>
                </div>
              )}

              {soldListings.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-base font-bold text-muted-foreground sm:text-lg">
                      Sotilgan e&apos;lonlar ({soldListings.length})
                    </h2>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {soldListings.map((entry) => (
                      <ListingCard key={entry.id} listing={entry} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        {/* Seller Reviews & Ratings Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-foreground sm:text-lg">
              Xaridorlar fikrlari ({sellerRatings.length})
            </h2>
            {hasRatings && (
              <div className="flex items-center gap-1.5 text-xs font-bold text-warning">
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                <span>{ratingSummary.averageRating.toFixed(1)} / 5.0</span>
                <span className="text-muted-foreground">({ratingSummary.ratingCount} ta baho)</span>
              </div>
            )}
          </div>

          {sellerRatings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <h3 className="mt-2 text-sm font-bold text-foreground">
                Hozircha sharhlar yo&apos;q
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Muvaffaqiyatli yakunlangan savdolardan so&apos;ng xaridorlar qoldirgan baholar shu yerda ko&apos;rinadi.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {sellerRatings.map((rev) => {
                const raterInitials = (rev.raterDisplayName || 'U')
                  .split(' ')
                  .map((c) => c[0])
                  .filter(Boolean)
                  .slice(0, 2)
                  .join('')
                  .toUpperCase();

                return (
                  <div
                    key={rev.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-card space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <Avatar className="h-8 w-8 ring-1 ring-primary/10">
                          {rev.raterPhotoUrl && (
                            <AvatarImage src={rev.raterPhotoUrl} alt={rev.raterDisplayName || ''} />
                          )}
                          <AvatarFallback className="text-xs font-bold">{raterInitials}</AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="text-xs font-bold text-foreground leading-tight">
                            {rev.raterDisplayName || 'Xaridor'}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {formatListingDate(rev.createdAt)}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 text-warning">
                        {[1, 2, 3, 4, 5].map((starVal) => (
                          <Star
                            key={starVal}
                            className={`h-3.5 w-3.5 ${
                              starVal <= rev.stars
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-muted-foreground/30'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    {rev.comment && (
                      <p className="text-xs text-foreground/90 pl-10">
                        {rev.comment}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </MarketplaceShell>
  );
}
