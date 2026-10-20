import { MailboxResources } from '@/components/profile/mailbox-resources';
import { AdminPlanMailboxes } from '@/components/admin/admin-plan-mailboxes';
import { getPlanEntitlementsSSR } from '@/lib/payment-admin-server';

export default async function AdminPlanMailboxesPage() {
  const rows = await getPlanEntitlementsSSR();
  if (!rows) {
    return (
      <>
      <MailboxResources admin />
      <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-semibold text-foreground">
        Limitlarni yuklab bo‘lmadi. Keyinroq urinib ko‘ring.
      </p>
      </>
    );
  }
  return <div className="space-y-6"><AdminPlanMailboxes initial={rows} /><MailboxResources admin /></div>;
}
