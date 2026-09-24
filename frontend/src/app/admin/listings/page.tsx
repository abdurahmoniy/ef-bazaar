import { AdminListingOwnerSearch } from '@/components/admin/admin-listing-owner-search';
import { AdminListings } from '@/components/admin/admin-listings';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { ownerLabel, resolveOwnerFilter } from '@/lib/admin-owner-filter';
import { getAdminListings, getAdminUsers } from '@/lib/marketplace-server';
import type { ListingStatus } from '@/lib/marketplace-types';

export const dynamic = 'force-dynamic';

const STATUSES: ListingStatus[] = ['ACTIVE', 'SOLD', 'DELETED'];

interface AdminListingsPageProps {
  searchParams?: Promise<{ status?: string; page?: string; owner?: string; ownerId?: string }>;
}

function resolveStatus(value: string | undefined): ListingStatus | undefined {
  return STATUSES.includes(value as ListingStatus) ? (value as ListingStatus) : undefined;
}

export default async function AdminListingsPage({ searchParams }: AdminListingsPageProps) {
  const params = searchParams ? await searchParams : {};
  const status = resolveStatus(params.status);
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  // Nomlar auth-service'da, e'lonlar marketplace'da — qidiruv shuning
  // uchun ikki qadam. Qidiruvning o'zi yiqilsa katalog baribir ochiladi:
  // suzgichning ishlamasligi butun sahifani yo'q qilmasligi kerak.
  const query = params.owner?.trim() || undefined;
  const matches = query || params.ownerId
    ? await getAdminUsers(query, 0, 10).then((r) => (r.ok ? r.data.content : []))
    : [];
  const owner = resolveOwnerFilter(params.ownerId, query, matches);
  const ownerId = owner.mode === 'single' ? owner.ownerId : undefined;

  const result = await getAdminListings(status, page, 20, ownerId);

  if (!result.ok) {
    return <ApiErrorPanel title="E'lonlar yuklanmadi" error={result.error} />;
  }

  const href = (target: number) => {
    const next = new URLSearchParams({ status: status ?? 'all', page: String(target) });
    if (query) next.set('owner', query);
    if (ownerId) next.set('ownerId', ownerId);
    return `/admin/listings?${next.toString()}`;
  };

  return (
    <div className="space-y-4">
      <AdminListingOwnerSearch
        status={status}
        query={query}
        activeLabel={owner.mode === 'single' ? owner.label : undefined}
      />

      {owner.mode === 'missing' && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          <b className="text-foreground">{owner.query}</b> bo&apos;yicha foydalanuvchi topilmadi.
          Username yoki ismni tekshirib qayta urinib ko&apos;ring.
        </p>
      )}

      {owner.mode === 'choose' && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-sm text-muted-foreground">
            Bir nechta foydalanuvchi mos keldi — kimnikini ko&apos;rasiz?
          </p>
          <ul className="flex flex-wrap gap-2">
            {owner.candidates.map((candidate) => (
              <li key={candidate.id}>
                <a
                  href={`/admin/listings?status=${status ?? 'all'}&owner=${encodeURIComponent(query ?? '')}&ownerId=${candidate.id}`}
                  className="inline-flex min-h-11 items-center rounded-full border border-border bg-card px-3 text-sm font-semibold text-foreground hover:border-primary/40"
                >
                  {ownerLabel(candidate)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <AdminListings
        listings={result.data.content}
        activeStatus={status}
        totalElements={result.data.totalElements}
      />
      <ListingsPagination
        page={result.data.page}
        totalPages={result.data.totalPages}
        buildHref={href}
      />
    </div>
  );
}
