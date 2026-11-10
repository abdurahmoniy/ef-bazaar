import type { Metadata } from 'next';

import { LegalDocumentView } from '@/components/legal/legal-document-view';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { LEGAL_DOCUMENTS } from '@/lib/legal';
import { resolveOptionalUser } from '@/lib/optional-auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Maxfiylik siyosati',
  description: 'efBazaar qaysi shaxsiy ma‘lumotlarni yig‘adi, nima uchun ishlatadi va kimga ko‘rsatadi.',
  alternates: { canonical: '/maxfiylik' },
};

export default async function PrivacyPage() {
  const viewer = await resolveOptionalUser(getMe);
  return (
    <MarketplaceShell user={viewer} hideSearch backHref="/marketplace" backLabel="Bozorga qaytish">
      <LegalDocumentView document={LEGAL_DOCUMENTS.privacy} />
    </MarketplaceShell>
  );
}
