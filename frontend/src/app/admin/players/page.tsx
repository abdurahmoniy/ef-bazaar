import { AdminPlayers } from '@/components/admin/admin-players';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { getAdminCards } from '@/lib/marketplace-server';
import type { CardType, MetaTier } from '@/lib/marketplace-types';
import { getCardInterestCounts } from '@/lib/rec-server';

export const dynamic = 'force-dynamic';

const CARD_TYPES: CardType[] = ['BIGTIME', 'EPIC', 'SHOWTIME'];
const TIERS: MetaTier[] = ['NORMAL', 'META'];
const PAGE_SIZE = 40;

interface AdminPlayersPageProps {
  searchParams?: Promise<{ q?: string; type?: string; tier?: string; page?: string }>;
}

export default async function AdminPlayersPage({ searchParams }: AdminPlayersPageProps) {
  const params = searchParams ? await searchParams : {};
  const query = params.q?.trim() || undefined;
  const type = CARD_TYPES.includes(params.type as CardType) ? (params.type as CardType) : undefined;
  const tier = TIERS.includes(params.tier as MetaTier) ? (params.tier as MetaTier) : undefined;
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  const result = await getAdminCards({
    q: query,
    types: type ? [type] : undefined,
    tier,
    page,
    size: PAGE_SIZE,
  });

  if (!result.ok) {
    return <ApiErrorPanel title="O'yinchilar yuklanmadi" error={result.error} />;
  }

  // Talab sonlari recommendation-service'da; u o'chiq bo'lsa katalog nol bilan ochiladi.
  const demand = await getCardInterestCounts(result.data.items.map((card) => card.efhubId));
  const cards = result.data.items.map((card) => {
    const counts = demand[String(card.efhubId)];
    return counts ? { ...card, interest7d: counts.days7, interest30d: counts.days30 } : card;
  });

  const totalPages = Math.max(1, Math.ceil(result.data.total / (result.data.size || PAGE_SIZE)));

  return (
    <div className="space-y-4">
      <AdminPlayers
        cards={cards}
        total={result.data.total}
        query={query}
        activeType={type}
        activeTier={tier}
      />
      <ListingsPagination
        page={result.data.page}
        totalPages={totalPages}
        buildHref={(target) => buildHref({ q: query, type, tier, page: target })}
      />
    </div>
  );
}

function buildHref(params: {
  q?: string;
  type?: CardType;
  tier?: MetaTier;
  page: number;
}) {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.type) search.set('type', params.type);
  if (params.tier) search.set('tier', params.tier);
  if (params.page > 0) search.set('page', String(params.page));
  const qs = search.toString();
  return qs ? `/admin/players?${qs}` : '/admin/players';
}
