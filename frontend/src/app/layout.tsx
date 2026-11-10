import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Script from 'next/script';
import './globals.css';

import { TelegramWebAppAutoLogin } from '@/components/auth/telegram-webapp-auto-login';
import { TermsConsentGate } from '@/components/legal/terms-consent-gate';
import { CampaignCapture } from '@/components/campaign/campaign-capture';
import { TelegramBackProvider } from '@/components/telegram/telegram-back-provider';
import { TelegramViewportBootstrap } from '@/components/telegram/telegram-viewport-bootstrap';
import { TelegramSdk } from '@/components/telegram/telegram-sdk';
import { ThemeScript } from '@/components/theme/theme-script';
import { StartupIntro } from '@/components/brand/startup-intro';
import { StartupIntroScript } from '@/components/brand/startup-intro-script';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { PushProvider } from '@/components/notifications/push-provider';
import { StoreProvider } from '@/store/provider';
import { RouteMotion } from '@/components/navigation/route-motion';
import { NavigationCacheGuard } from '@/components/navigation/navigation-cache-guard';
import { AppToaster } from '@/components/providers/app-toaster';
import { ClientQueryProvider } from '@/components/providers/client-query-provider';
import { BackgroundMusic } from '@/components/music/background-music';

const YANDEX_METRIKA_ID = 110535295;

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const googleVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();
const yandexVerification = process.env.NEXT_PUBLIC_YANDEX_VERIFICATION?.trim();

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: [...siteConfig.keywords],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  publisher: siteConfig.name,
  category: 'marketplace',
  alternates: {
    canonical: '/',
    languages: {
      'uz-UZ': '/',
      'x-default': '/',
    },
  },
  openGraph: {
    title: siteConfig.title,
    description: siteConfig.description,
    url: '/',
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    type: 'website',
    images: [
      {
        url: absoluteUrl('/opengraph-image'),
        width: 1200,
        height: 630,
        alt: 'eFBazaar eFootball account marketplace preview',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: siteConfig.title,
    description: siteConfig.description,
    images: [absoluteUrl('/twitter-image')],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  ...(googleVerification || yandexVerification
    ? {
        verification: {
          ...(googleVerification ? { google: googleVerification } : {}),
          ...(yandexVerification ? { yandex: yandexVerification } : {}),
        },
      }
    : {}),
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#090910' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* Independent raw fallback: stored/system theme still initializes if the SDK fails. */}
        <ThemeScript />
        <StartupIntroScript />
      </head>
      <body className="font-sans">
        <TelegramSdk />
        <StartupIntro />
        {/* Syncs the first visible Mini App state before calling Telegram ready. */}
        <TelegramViewportBootstrap />
        {/* Telegram Mini App context aniqlansa har qanday entry point'da auto-login */}
        <TelegramWebAppAutoLogin />
        {/* Bosilishni kirmagan mehmon uchun ham sanaydi; da'vo shell'larda. */}
        <CampaignCapture />

        <TelegramBackProvider>
          <ClientQueryProvider>
            <StoreProvider>
              <PushProvider>
                <RouteMotion />
                <NavigationCacheGuard />
                <BackgroundMusic />
                {children}
                <AppToaster />
                <TermsConsentGate />
              </PushProvider>
            </StoreProvider>
          </ClientQueryProvider>
        </TelegramBackProvider>

        <Script id="yandex-metrika" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){
                m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
            })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${YANDEX_METRIKA_ID}', 'ym');

            ym(${YANDEX_METRIKA_ID}, 'init', {ssr:true, webvisor:true, clickmap:true, ecommerce:"dataLayer", referrer: document.referrer, url: location.href, accurateTrackBounce:true, trackLinks:true});
          `}
        </Script>
        <noscript>
          <div>
            <img
              src={`https://mc.yandex.ru/watch/${YANDEX_METRIKA_ID}`}
              style={{ position: 'absolute', left: '-9999px' }}
              alt=""
            />
          </div>
        </noscript>
      </body>
    </html>
  );
}
