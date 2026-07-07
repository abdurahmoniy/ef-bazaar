import { AdminReports } from '@/components/admin/admin-reports';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { getAdminReports } from '@/lib/marketplace-server';
import type { ReportStatus } from '@/lib/marketplace-types';

export const dynamic = 'force-dynamic';

const STATUSES: ReportStatus[] = ['PENDING', 'RESOLVED', 'DISMISSED'];

interface AdminReportsPageProps {
  searchParams?: Promise<{ status?: string; page?: string }>;
}

function resolveStatus(value: string | undefined): ReportStatus | undefined {
  if (value === 'all') return undefined;
  return STATUSES.includes(value as ReportStatus) ? (value as ReportStatus) : 'PENDING';
}

export default async function AdminReportsPage({ searchParams }: AdminReportsPageProps) {
  const params = searchParams ? await searchParams : {};
  const status = resolveStatus(params.status);
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  const result = await getAdminReports(status, page);

  if (!result.ok) {
    return <ApiErrorPanel title="Shikoyatlar yuklanmadi" error={result.error} />;
  }

  return (
    <div className="space-y-4">
      <AdminReports reports={result.data.content} activeStatus={status} />
      <ListingsPagination
        page={result.data.page}
        totalPages={result.data.totalPages}
        buildHref={(target) => `/admin/reports?status=${status ?? 'all'}&page=${target}`}
      />
    </div>
  );
}
