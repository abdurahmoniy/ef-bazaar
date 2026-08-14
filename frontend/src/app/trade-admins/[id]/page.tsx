import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Star } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import {
  InactiveAdminNotice,
  TradeAdminTrustStats,
} from '@/components/trade-admin/trade-admin-card';
import { Badge } from '@/components/ui/badge';
import { getMe } from '@/lib/auth';
import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { formatDurationUz } from '@/lib/trade-human';
import { getTradeAdminProfile, getTradeAdminRatings } from '@/lib/trade-server';
import { FEATURES } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Inson admin profili',
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function TradeAdminProfilePage({ params }: PageProps) {
  // Human trade admin is closed for use (FEATURES.humanAdmin). notFound()
  // rather than a "coming soon" screen: the feature is not arriving, it is
  // switched off, and a 404 is the honest answer for a route with no way in.
  if (!FEATURES.humanAdmin) notFound();

  const { id } = await params;
  const [user, profile, ratings] = await Promise.all([
    resolveOptionalUser(getMe),
    getTradeAdminProfile(id),
    getTradeAdminRatings(id),
  ]);

  if (!profile) notFound();

  return (
    <MarketplaceShell user={user} hideSearch backHref="/trade-admins" backLabel="Adminlar">
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4 shadow-card">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black text-foreground">
                  {profile.displayName?.trim() || "Ismi ko'rsatilmagan admin"}
                </h1>
                {profile.acceptingOrders && profile.active ? (
                  <Badge variant="info">Buyurtma qabul qiladi</Badge>
                ) : (
                  <Badge variant="muted">Pauzada</Badge>
                )}
              </div>
              <p className="mt-1 text-sm font-semibold text-muted-foreground">
                {formatPriceUZS(profile.minFeeUzs)} - {formatPriceUZS(profile.maxFeeUzs)}
              </p>
              {profile.bio && (
                <p className="mt-3 max-w-3xl whitespace-pre-wrap text-sm text-foreground">
                  {profile.bio}
                </p>
              )}
            </div>
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>
                Sig'im: <b className="text-foreground">{profile.maxConcurrentTrades}</b> aktiv savdo
              </p>
              <p>
                O'rtacha vaqt:{' '}
                <b className="text-foreground">
                  {profile.averageWorkSeconds ? formatDurationUz(profile.averageWorkSeconds) : 'Hali yo\'q'}
                </b>
              </p>
            </div>
          </div>

          <div className="mt-4">
            <TradeAdminTrustStats profile={profile} />
          </div>

          {(!profile.active || !profile.acceptingOrders) && (
            <div className="mt-4">
              <InactiveAdminNotice />
            </div>
          )}
        </section>

        <section className="rounded-lg border border-border bg-card p-4 shadow-card">
          <h2 className="text-sm font-black text-foreground">Baholar</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Platform faqat rating orqali yomon adminni ko'rsatishi mumkin. Yulduz va izohlarni
            qarab tanlang.
          </p>

          {ratings.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Hali baho yo'q.
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {ratings.map((rating) => (
                <li key={rating.id} className="rounded-lg border border-border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1 text-amber-500">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Star
                          key={index}
                          className={index < rating.stars ? 'h-4 w-4 fill-current' : 'h-4 w-4'}
                        />
                      ))}
                    </div>
                    <span className="text-[10.5px] font-semibold text-muted-foreground">
                      {rating.raterRole === 'SELLER' ? 'Sotuvchi' : 'Xaridor'} ·{' '}
                      {formatListingDate(rating.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-foreground">
                    {rating.comment ?? 'Izoh platform admini tomonidan yashirilgan.'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </MarketplaceShell>
  );
}
