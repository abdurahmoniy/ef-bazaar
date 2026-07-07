import { AdminListings } from '@/components/admin/admin-listings';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { getAdminListings } from '@/lib/marketplace-server';
import type { ListingStatus } from '@/lib/marketplace-types';

export const dynamic = 'force-dynamic';

const STATUSES: ListingStatus[] = ['ACTIVE', 'SOLD', 'DELETED'];

interface AdminListingsPageProps {
  searchParams?: Promise<{ status?: string; page?: string }>;
}

function resolveStatus(value: string | undefined): ListingStatus | undefined {
  return STATUSES.includes(value as ListingStatus) ? (value as ListingStatus) : undefined;
}

export default async function AdminListingsPage({ searchParams }: AdminListingsPageProps) {
  const params = searchParams ? await searchParams : {};
  const status = resolveStatus(params.status);
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  const result = await getAdminListings(status, page);

  if (!result.ok) {
    return <ApiErrorPanel title="E'lonlar yuklanmadi" error={result.error} />;
  }

  return (
    <div className="space-y-4">
      <AdminListings
        listings={result.data.content}
        activeStatus={status}
        totalElements={result.data.totalElements}
      />
      <ListingsPagination
        page={result.data.page}
        totalPages={result.data.totalPages}
        buildHref={(target) => `/admin/listings?status=${status ?? 'all'}&page=${target}`}
      />
    </div>
  );
}
