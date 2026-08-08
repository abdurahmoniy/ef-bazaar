import { AdminTradeAdminApplications } from '@/components/admin/admin-trade-admin-applications';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { getAdminTradeAdminApplications } from '@/lib/trade-admin-applications-server';
import type { TradeAdminApplicationStatus } from '@/lib/trade-admin-applications';

export const dynamic = 'force-dynamic';

const STATUSES: TradeAdminApplicationStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

interface AdminTradeAdminApplicationsPageProps {
  searchParams?: Promise<{ status?: string; page?: string }>;
}

function resolveStatus(value: string | undefined): TradeAdminApplicationStatus | undefined {
  if (value === 'all') return undefined;
  return STATUSES.includes(value as TradeAdminApplicationStatus)
    ? (value as TradeAdminApplicationStatus)
    : 'PENDING';
}

export default async function AdminTradeAdminApplicationsPage({
  searchParams,
}: AdminTradeAdminApplicationsPageProps) {
  const params = searchParams ? await searchParams : {};
  const status = resolveStatus(params.status);
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  const result = await getAdminTradeAdminApplications(status, page);

  if (!result.ok) {
    return <ApiErrorPanel title="Inson admin arizalari yuklanmadi" error={result.error} />;
  }

  return (
    <div className="space-y-4">
      <AdminTradeAdminApplications applications={result.data.content} activeStatus={status} />
      <ListingsPagination
        page={result.data.page}
        totalPages={result.data.totalPages}
        buildHref={(target) =>
          `/admin/trade-admin-applications?status=${status ?? 'all'}&page=${target}`
        }
      />
    </div>
  );
}
