import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { CustomClaim } from '@/components/mailboxes/custom-claim';
import { CustomMailboxList } from '@/components/mailboxes/custom-mailbox-list';
import { getMe } from '@/lib/auth';
import { getMyCustomMailboxesSSR, getMyMailboxesSSR } from '@/lib/custom-mailbox-server';
import { getMyAccountsServer } from '@/lib/accounts-server';
import { FreeTradeMailboxList } from '@/components/mailboxes/free-trade-mailbox-list';
import { getMyPlanSSR } from '@/lib/plans-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Custom pochta' };

export default async function CustomMailboxPage({
  searchParams,
}: {
  searchParams: Promise<{ accountId?: string }>;
}) {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/mailboxes/custom');
  const { accountId } = await searchParams;
  const [mine, boxes, owned, accounts] = await Promise.all([
    getMyPlanSSR(), getMyCustomMailboxesSSR(), getMyMailboxesSSR(), getMyAccountsServer(),
  ]);
  const accountEmails = accounts.filter((a) => a.status === 'ACTIVE' && a.email).map((a) => a.email as string);

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch hideHeader backHref="/profile?tab=accounts">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 sm:gap-8 sm:px-6 sm:py-12">
        <header className="flex flex-col gap-1 sm:items-center sm:gap-3 sm:text-center">
          <span className="hidden items-center gap-2 rounded-full bg-gold-soft px-3.5 py-1.5 text-xs font-extrabold uppercase tracking-wider text-gold-foreground sm:inline-flex">
            Custom email
          </span>
          <h1 className="text-xl font-extrabold tracking-tight sm:text-5xl">O‘zingiz istagan nom bilan email oling</h1>
          <p className="hidden max-w-xl text-lg leading-relaxed text-muted-foreground sm:block">
            Konami akkountingiz uchun esda qoladigan manzil. Nomni bir marta tanlaysiz — u faqat sizniki bo‘lib qoladi.
          </p>
        </header>
        <CustomClaim plan={mine?.code ?? null} accountId={accountId ?? null} />
        {boxes === null ? (
          <p className="text-sm text-muted-foreground">Qutilaringiz ro‘yxatini yuklab bo‘lmadi.</p>
        ) : (
          <CustomMailboxList boxes={boxes} />
        )}
        {owned && <FreeTradeMailboxList boxes={owned} accountEmails={accountEmails} />}
      </div>
    </MarketplaceShell>
  );
}
