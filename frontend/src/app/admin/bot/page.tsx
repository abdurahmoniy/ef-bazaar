import { AdminBotSettings } from '@/components/admin/admin-bot-settings';
import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getAdminBotSettings } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export default async function AdminBotPage() {
  const result = await getAdminBotSettings();

  if (!result.ok) {
    return <ApiErrorPanel title="Bot sozlamalari yuklanmadi" error={result.error} />;
  }

  return <AdminBotSettings initial={result.data} />;
}
