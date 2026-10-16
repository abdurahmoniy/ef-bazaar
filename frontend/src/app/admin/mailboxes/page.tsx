import { AdminMailboxes } from '@/components/admin/admin-mailboxes';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { ListingsPagination } from '@/components/marketplace/listings-pagination';
import {
  getAdminMailboxStats,
  getAdminMailboxDomains,
  getAdminMailboxes,
  getUsersByIds,
} from '@/lib/mailbox-admin-server';
import type { MailboxFilter } from '@/lib/mailbox-admin-types';
import { getAdminUsers } from '@/lib/marketplace-server';
import type { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

/**
 * Mailbox domain shown next to the local-part input. Cosmetic only — the
 * authoritative value is trade-service's `trade.mailbox.domain`, which builds
 * the address server-side.
 */
const MAIL_DOMAIN = process.env.NEXT_PUBLIC_MAIL_DOMAIN || 'efbazaar.uz';

const FILTERS: MailboxFilter[] = ['all', 'trade', 'admin', 'pending', 'unassigned'];

interface AdminMailboxesPageProps {
  searchParams?: Promise<{
    search?: string;
    ownerUserId?: string;
    filter?: string;
    page?: string;
  }>;
}

export default async function AdminMailboxesPage({ searchParams }: AdminMailboxesPageProps) {
  const params = searchParams ? await searchParams : {};
  const search = params.search?.trim() || undefined;
  const ownerUserId = params.ownerUserId?.trim() || undefined;
  const filter = (FILTERS.find((f) => f === params.filter) ?? 'all') as MailboxFilter;
  const page = Math.max(0, Number.parseInt(params.page ?? '0', 10) || 0);

  const [result, stats, usersResult, mailDomains] = await Promise.all([
    getAdminMailboxes({ search, ownerUserId, filter, page }),
    getAdminMailboxStats(),
    // Owner dropdown for the create form. Newest 50 users covers the common
    // case; for anyone older the admin goes through the Foydalanuvchilar tab,
    // which links here with ownerUserId already set.
    getAdminUsers(undefined, 0, 50),
    getAdminMailboxDomains(MAIL_DOMAIN),
  ]);

  if (!result.ok) {
    return <ApiErrorPanel title="Pochtalar yuklanmadi" error={result.error} />;
  }

  const ownerIds = result.data.content
    .map((mailbox) => mailbox.ownerUserId)
    .filter((id): id is string => Boolean(id));
  if (ownerUserId) ownerIds.push(ownerUserId);

  const owners = await getUsersByIds(ownerIds);
  const selectableUsers: User[] = usersResult.ok ? usersResult.data.content : [];

  const buildHref = (target: number) => {
    const query = new URLSearchParams({ page: String(target) });
    if (search) query.set('search', search);
    if (ownerUserId) query.set('ownerUserId', ownerUserId);
    if (filter !== 'all') query.set('filter', filter);
    return `/admin/mailboxes?${query.toString()}`;
  };

  return (
    <div className="space-y-5">
      <AdminMailboxes
        mailboxes={result.data.content}
        owners={Object.fromEntries(owners)}
        search={search}
        ownerUserId={ownerUserId}
        ownerUser={ownerUserId ? (owners.get(ownerUserId) ?? null) : null}
        filter={filter}
        stats={stats}
        totalElements={result.data.totalElements}
        selectableUsers={selectableUsers}
        mailDomain={MAIL_DOMAIN}
        mailDomains={mailDomains}
      />
      <ListingsPagination
        page={result.data.page}
        totalPages={result.data.totalPages}
        buildHref={buildHref}
      />
    </div>
  );
}
