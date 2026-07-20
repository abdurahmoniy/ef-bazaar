import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { GamerCardView } from '@/components/gamer/gamer-card-view';
import { ShareGamerCardButton } from '@/components/gamer/share-gamer-card-button';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { getGamerCard } from '@/lib/gamer-server';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

const CAPTURE_ID = 'gamer-card-capture';

interface GamerPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: GamerPageProps): Promise<Metadata> {
  const { id } = await params;
  const card = await getGamerCard(id);
  return {
    title: card?.displayName ? `${card.displayName} — Gamer Card` : 'Gamer Card',
  };
}

/** Public shareable Gamer Card page. */
export default async function GamerPage({ params }: GamerPageProps) {
  const { id } = await params;
  const [card, viewer] = await Promise.all([getGamerCard(id), resolveOptionalUser(getMe)]);
  if (!card) notFound();

  return (
    <MarketplaceShell user={viewer} hideSearch backHref="/marketplace">
      <div className="mx-auto max-w-xl px-4 py-6">
        <GamerCardView card={card} captureId={CAPTURE_ID} />
        <div className="mt-4 flex justify-center">
          <ShareGamerCardButton captureId={CAPTURE_ID} username={card.telegramUsername} />
        </div>
      </div>
    </MarketplaceShell>
  );
}
