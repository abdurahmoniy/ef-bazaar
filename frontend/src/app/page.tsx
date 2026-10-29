import type { Metadata } from 'next';

import { ReferralWelcome } from '@/components/growth/referral-welcome';
import { LandingV2 } from '@/components/landing-v2/landing-v2';
import { absoluteUrl, siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  title: { absolute: siteConfig.title },
  description: siteConfig.description,
  alternates: { canonical: '/', languages: { 'uz-UZ': '/', 'x-default': '/' } },
  robots: { index: true, follow: true },
};

const structuredData = {
	'@context': 'https://schema.org',
	'@graph': [
		{
			'@type': 'Organization',
			'@id': `${siteConfig.url}/#organization`,
			name: siteConfig.name,
			url: siteConfig.url,
			logo: {
				'@type': 'ImageObject',
				url: absoluteUrl('/brand-icon/512'),
				width: 512,
				height: 512,
			},
			sameAs: [
				siteConfig.links.telegram,
				siteConfig.links.telegramChannel,
				siteConfig.links.instagram,
			],
		},
		{
			'@type': 'WebSite',
			'@id': `${siteConfig.url}/#website`,
			url: siteConfig.url,
			name: siteConfig.name,
			description: siteConfig.description,
			inLanguage: 'uz-UZ',
			publisher: {
				'@id': `${siteConfig.url}/#organization`,
			},
			potentialAction: {
				'@type': 'SearchAction',
				target: {
					'@type': 'EntryPoint',
					urlTemplate: `${siteConfig.url}/marketplace?q={search_term_string}`,
				},
				'query-input': 'required name=search_term_string',
			},
		},
		{
			'@type': 'WebApplication',
			'@id': `${siteConfig.url}/#webapp`,
			name: siteConfig.name,
			url: siteConfig.url,
			applicationCategory: 'MarketplaceApplication',
			operatingSystem: 'Web, Telegram',
			inLanguage: 'uz-UZ',
			description: siteConfig.description,
		},
	],
}

const jsonLd = JSON.stringify(structuredData).replace(/</g, '\\u003c');

export default function HomePage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
      <LandingV2 welcome={<ReferralWelcome />} />
    </>
  );
}
