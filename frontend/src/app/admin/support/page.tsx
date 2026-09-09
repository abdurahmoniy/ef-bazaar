import { AdminSupportView } from '@/components/admin/admin-support-view';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { getAdminSupportChats } from '@/lib/marketplace-server';
import type { SupportCategory, SupportChatStatus } from '@/lib/support';

export const dynamic = 'force-dynamic';

const VALID_STATUSES: SupportChatStatus[] = ['OPEN', 'REPLIED', 'CLOSED'];
const VALID_CATEGORIES: SupportCategory[] = ['SUPPORT', 'PARTNERSHIP', 'QUESTION'];

interface AdminSupportPageProps {
  searchParams?: Promise<{
    status?: string;
    category?: string;
    search?: string;
    page?: string;
  }>;
}

function resolveStatus(value: string | undefined): SupportChatStatus | undefined {
  if (value === 'all') return undefined;
  if (!value) return undefined; // Ko'rsatilmasa barcha murojaatlarni ko'rsatish
  return VALID_STATUSES.includes(value as SupportChatStatus)
    ? (value as SupportChatStatus)
    : undefined;
}

function resolveCategory(value: string | undefined): SupportCategory | undefined {
  if (value === 'all' || !value) return undefined;
  return VALID_CATEGORIES.includes(value as SupportCategory)
    ? (value as SupportCategory)
    : undefined;
}

export default async function AdminSupportPage({ searchParams }: AdminSupportPageProps) {
  const params = searchParams ? await searchParams : {};
  const status = resolveStatus(params.status);
  const category = resolveCategory(params.category);
  const search = params.search?.trim() || undefined;
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  const result = await getAdminSupportChats(category, status, search, page);

  if (!result.ok) {
    return <ApiErrorPanel title="Murojaatlar yuklanmadi" error={result.error} />;
  }

  function buildPaginationHref(target: number) {
    const q = new URLSearchParams();
    if (status) q.set('status', status);
    if (category) q.set('category', category);
    if (search) q.set('search', search);
    q.set('page', String(target));
    return `/admin/support?${q.toString()}`;
  }

  return (
    <div className="space-y-6">
      <AdminSupportView
        chats={result.data.content}
        activeStatus={status}
        activeCategory={category}
        activeSearch={search}
      />
      {result.data.totalPages > 1 && (
        <ListingsPagination
          page={result.data.page}
          totalPages={result.data.totalPages}
          buildHref={buildPaginationHref}
        />
      )}
    </div>
  );
}
