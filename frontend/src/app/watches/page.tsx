import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { WatchesView } from '@/components/watch/watches-view';
import { getMe } from '@/lib/auth';
import { getMyPlanSSR } from '@/lib/plans-server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Kuzatuvlar', robots: { index: false, follow: false } };

export default async function WatchesPage({ searchParams }: { searchParams?: Promise<{ criteria?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const query = typeof params.criteria === 'string' ? params.criteria : '';
  const user = await getMe();
  if (!user) redirect(`/auth/login?from=${encodeURIComponent(`/watches${query ? `?criteria=${encodeURIComponent(query)}` : ''}`)}`);
  // Payment owns first-time Free initialization and its durable projection event.
  // Watch services remain the authority while that event is being applied.
  await getMyPlanSSR();
  return <MarketplaceShell user={user} hideSearch backHref="/marketplace">
    <WatchesView key={user.id} initialQuery={query} />
  </MarketplaceShell>;
}
