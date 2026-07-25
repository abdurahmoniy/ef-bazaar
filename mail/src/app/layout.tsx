import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

import { ThemeScript } from '@/components/theme/theme-script';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: {
    default: 'eFBazaar Pochta',
    template: '%s | eFBazaar Pochta',
  },
  description:
    "Savdo yakunlangan akkountlarning pochtasi — Konami xatlari, parol tiklash va 2FA kodlari bir joyda.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0b0f' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={inter.variable} suppressHydrationWarning>
      <body className="font-sans">
        {/* No-flash theme init — must run before hydration */}
        <ThemeScript />
        {children}
      </body>
    </html>
  );
}
