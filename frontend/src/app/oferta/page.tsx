import type { Metadata } from 'next';

import { LegalDocumentView } from '@/components/legal/legal-document-view';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { LEGAL_DOCUMENTS } from '@/lib/legal';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Ommaviy oferta',
  description: 'efBazaar platformasidan foydalanish shartlari — garov orqali savdo, hamyon, nizolar va javobgarlik.',
  alternates: { canonical: '/oferta' },
};

export default async function OfertaPage() {
  const viewer = await resolveOptionalUser(getMe);
  return (
    <MarketplaceShell user={viewer} hideSearch backHref="/marketplace" backLabel="Bozorga qaytish">
      <LegalDocumentView document={LEGAL_DOCUMENTS.oferta} />
    </MarketplaceShell>
  );
}
