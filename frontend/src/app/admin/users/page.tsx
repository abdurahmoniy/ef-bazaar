import { AdminUsers } from '@/components/admin/admin-users';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import { getMe } from '@/lib/auth';
import { getAdminUsers } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

interface AdminUsersPageProps {
  searchParams?: Promise<{ search?: string; page?: string }>;
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
  const params = searchParams ? await searchParams : {};
  const search = params.search?.trim() || undefined;
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  const [me, result] = await Promise.all([getMe(), getAdminUsers(search, page)]);

  if (!result.ok) {
    return <ApiErrorPanel title="Foydalanuvchilar yuklanmadi" error={result.error} />;
  }

  return (
    <div className="space-y-4">
      <AdminUsers
        users={result.data.content}
        search={search}
        totalElements={result.data.totalElements}
        currentUserId={me?.id ?? null}
      />
      <ListingsPagination
        page={result.data.page}
        totalPages={result.data.totalPages}
        buildHref={(target) =>
          `/admin/users?page=${target}${search ? `&search=${encodeURIComponent(search)}` : ''}`
        }
      />
    </div>
  );
}
