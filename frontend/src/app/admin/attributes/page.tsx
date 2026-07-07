import { AdminAttributes } from '@/components/admin/admin-attributes';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getAdminAttributeDefinitions } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export default async function AdminAttributesPage() {
  const result = await getAdminAttributeDefinitions();

  if (!result.ok) {
    return <ApiErrorPanel title="Atributlar yuklanmadi" error={result.error} />;
  }

  return <AdminAttributes definitions={result.data} />;
}
