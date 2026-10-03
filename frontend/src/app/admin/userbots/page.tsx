import { UserbotPanel } from '@/components/admin/userbots/userbot-panel';
import { listUserbotAccountsSSR, listUserbotFeaturesSSR } from '@/lib/userbot-server';

/**
 * Telegram userbot accounts and the jobs they are bound to. The admin gate and
 * `force-dynamic` come from `src/app/admin/layout.tsx`; userbot-core itself
 * checks ROLE_ADMIN again.
 */
export default async function AdminUserbotsPage() {
  const [accounts, features] = await Promise.all([listUserbotAccountsSSR(), listUserbotFeaturesSSR()]);
  if (!accounts || !features) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
        Userbot servisidan ma&apos;lumot olib bo&apos;lmadi. Sahifani yangilab ko&apos;ring.
      </p>
    );
  }
  return <UserbotPanel initialAccounts={accounts} initialFeatures={features} />;
}
