import { AdminTrust } from '@/components/admin/admin-trust';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import type { TrustComplaintStatus } from '@/lib/gamer-types';
import { getAdminTrustComplaints } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

const STATUSES: TrustComplaintStatus[] = ['PENDING', 'CONFIRMED', 'REJECTED'];

interface AdminTrustPageProps {
  searchParams?: Promise<{ status?: string; page?: string }>;
}

function resolveStatus(value: string | undefined): TrustComplaintStatus | undefined {
  if (value === 'all') return undefined;
  return STATUSES.includes(value as TrustComplaintStatus)
    ? (value as TrustComplaintStatus)
    : 'PENDING';
}

export default async function AdminTrustPage({ searchParams }: AdminTrustPageProps) {
  const params = searchParams ? await searchParams : {};
  const status = resolveStatus(params.status);
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  const result = await getAdminTrustComplaints(status, page);

  if (!result.ok) {
    return <ApiErrorPanel title="Shikoyatlar yuklanmadi" error={result.error} />;
  }

  return (
    <div className="space-y-4">
      <AdminTrust complaints={result.data.content} activeStatus={status} />
      <ListingsPagination
        page={result.data.page}
        totalPages={result.data.totalPages}
        buildHref={(target) => `/admin/trust?status=${status ?? 'all'}&page=${target}`}
      />
    </div>
  );
}
