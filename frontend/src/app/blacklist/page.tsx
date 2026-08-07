import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldAlert, ShieldX, Timer } from 'lucide-react';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { Badge } from '@/components/ui/badge';
import { getMe } from '@/lib/auth';
import { getBlacklistPage } from '@/lib/gamer-server';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: "Qora ro'yxat",
  description: "efBazaar qora ro'yxati — bloklangan foydalanuvchilar, sabablari va muddatlari.",
};

interface BlacklistPageProps {
  searchParams?: Promise<{ page?: string }>;
}

/** Public scam registry — akkaunt olishdan oldin sotuvchini tekshiring. */
export default async function BlacklistPage({ searchParams }: BlacklistPageProps) {
  const params = searchParams ? await searchParams : {};
  const pageNum = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);
  const [viewer, page] = await Promise.all([
    resolveOptionalUser(getMe),
    getBlacklistPage(pageNum),
  ]);
  const entries = page?.content ?? [];

  return (
    <MarketplaceShell user={viewer} activeTab="safety" hideSearch backHref="/marketplace">
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-black text-foreground">Qora ro'yxat</h1>
            <p className="text-xs text-muted-foreground">
              Tasdiqlangan shikoyatlar asosida bloklangan foydalanuvchilar. Akkaunt
              olishdan oldin sotuvchini tekshiring.
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {entries.length === 0 && (
            <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              Hozircha qora ro'yxat bo'sh.
            </div>
          )}
          {entries.map((entry) => {
            const since = new Date(entry.since);
            const sinceLabel = Number.isNaN(since.getTime())
              ? '—'
              : new Intl.DateTimeFormat('uz-UZ', { dateStyle: 'medium' }).format(since);
            const permanent = entry.penaltyType === 'PERM_BLOCK';
            return (
              <div
                key={`${entry.userId}-${entry.since}`}
                className="rounded-xl border border-red-200/70 bg-card p-4 shadow-card"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link
                    href={`/gamers/${entry.userId}`}
                    className="truncate text-sm font-bold text-foreground hover:text-primary"
                  >
                    {entry.displayName ?? "Noma'lum foydalanuvchi"}
                  </Link>
                  <Badge variant="warn" className="shrink-0">
                    {permanent ? (
                      <>
                        <ShieldX className="h-3 w-3" /> doimiy blok
                      </>
                    ) : (
                      <>
                        <Timer className="h-3 w-3" /> vaqtinchalik blok
                      </>
                    )}
                  </Badge>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground">{entry.reason}</p>
                <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground">
                  <span>{sinceLabel} dan</span>
                  <span>{entry.confirmedComplaints} ta tasdiqlangan shikoyat</span>
                </div>
              </div>
            );
          })}
        </div>

        {page && page.totalPages > 1 && (
          <div className="mt-5 flex items-center justify-center gap-2 text-sm">
            {pageNum > 0 && (
              <Link className="font-semibold text-primary" href={`/blacklist?page=${pageNum - 1}`}>
                ← Oldingi
              </Link>
            )}
            <span className="text-muted-foreground">
              {pageNum + 1} / {page.totalPages}
            </span>
            {pageNum + 1 < page.totalPages && (
              <Link className="font-semibold text-primary" href={`/blacklist?page=${pageNum + 1}`}>
                Keyingi →
              </Link>
            )}
          </div>
        )}
      </div>
    </MarketplaceShell>
  );
}
