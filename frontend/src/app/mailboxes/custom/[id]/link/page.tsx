import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';

import { LinkWizard } from '@/components/mailboxes/link-wizard';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMyAccountsServer } from '@/lib/accounts-server';
import { getMe } from '@/lib/auth';
import { getMyOwnedMailboxesSSR } from '@/lib/custom-mailbox-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Akkountni ulash', robots: { index: false, follow: false } };

export default async function LinkMailboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ accountId?: string; session?: string; verify?: string }>;
}) {
  const { id } = await params;
  const user = await getMe();
  if (!user) redirect(`/auth/login?from=${encodeURIComponent(`/mailboxes/custom/${id}/link`)}`);
  const query = await searchParams;
  const [boxes, accounts] = await Promise.all([getMyOwnedMailboxesSSR(), getMyAccountsServer()]);
  // Any of the user's own boxes: a custom one, or a trade box being verified.
  const box = boxes?.find((b) => b.id === id);
  if (!box) notFound();

  return (
    <MarketplaceShell user={user} activeTab="profile" hideSearch hideHeader backHref="/mailboxes/custom">
      <div className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6 sm:py-10">
        <LinkWizard
          mailboxId={box.id}
          email={box.email}
          accounts={accounts}
          initialAccountId={query.accountId ?? null}
          initialSessionId={query.session ?? box.activeSessionId ?? null}
          verify={query.verify === '1' && Boolean(query.accountId)}
        />
      </div>
    </MarketplaceShell>
  );
}
