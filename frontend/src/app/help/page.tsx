import type { Metadata } from 'next';
import { HelpView } from '@/components/help/help-view';
import { MarketplaceShell } from '@/components/marketplace/marketplace-shell';
import { getMe } from '@/lib/auth';
import { listPublicGuides, type Guide } from '@/lib/guides';
import { HELP_ITEMS, type HelpCategory } from '@/lib/help-data';
import { resolveOptionalUser } from '@/lib/optional-auth';
import { absoluteUrl, siteConfig } from '@/lib/site';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Yordam va Qo‘llanma',
  description:
    'efBazaar yordam markazi — eFootball akkountlarini xavfsiz sotib olish, sotish, obmen qilish, Garov (Escrow) tizimi, tangalar va firibgarlardan himoyalanish qo‘llanmasi.',
  alternates: {
    canonical: '/help',
  },
  openGraph: {
    title: 'Yordam va Qo‘llanma | efBazaar',
    description:
      'eFootball akkountlarini xavfsiz sotib olish, sotish, obmen qilish va Garov (Escrow) tizimi bo‘yicha qo‘llanma.',
    url: '/help',
    siteName: siteConfig.name,
    type: 'website',
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebPage',
      '@id': `${siteConfig.url}/help/#webpage`,
      url: `${siteConfig.url}/help`,
      name: 'Yordam va Qo‘llanma | efBazaar',
      description:
        'eFootball akkountlarini xavfsiz sotib olish, sotish, obmen qilish va Garov (Escrow) tizimi bo‘yicha qo‘llanma.',
    },
    {
      '@type': 'FAQPage',
      '@id': `${siteConfig.url}/help/#faq`,
      mainEntity: HELP_ITEMS.map((item) => ({
        '@type': 'Question',
        name: item.title,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${item.summary} ${item.content.join(' ')}`,
        },
      })),
    },
  ],
};

const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');

interface HelpPageProps {
  searchParams?: Promise<{
    category?: string;
    q?: string;
  }>;
}

export default async function HelpPage({ searchParams }: HelpPageProps) {
  const params = searchParams ? await searchParams : {};
  const viewer = await resolveOptionalUser(getMe);

  const initialCategory = (params.category as HelpCategory) || 'all';
  const initialQuery = params.q || '';

  let initialGuides: Guide[] = [];
  try {
    initialGuides = await listPublicGuides();
  } catch {
    initialGuides = [];
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <MarketplaceShell
        user={viewer}
        hideSearch
        backHref="/marketplace"
        backLabel="Bozorga qaytish"
      >
        <div className="mx-auto w-full max-w-4xl pt-2">
          <HelpView
            initialCategory={initialCategory}
            initialQuery={initialQuery}
            initialGuides={initialGuides}
          />
        </div>
      </MarketplaceShell>
    </>
  );
}
