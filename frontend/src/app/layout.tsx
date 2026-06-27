import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'efBazaar — eFootball Account Marketplace',
  description: 'eFootball akkountlarini xavfsiz sotib oling va soting. Pro accountlar, divisionlar, real narxlar.',
  keywords: ['eFootball', 'PES', 'account', 'marketplace', 'efbazaar', 'akkount', 'savdo'],
  openGraph: {
    title: 'efBazaar',
    description: 'eFootball account marketplace',
    type: 'website',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f0c29',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" className={`${inter.variable} dark`} suppressHydrationWarning>
      <body className="font-sans">
        {/* Decorative ambient glows */}
        <div className="pointer-events-none fixed inset-0 overflow-hidden -z-10">
          <div className="absolute -top-1/2 -left-1/4 w-[600px] h-[600px] rounded-full bg-cyber-cyan/10 blur-[100px] animate-glow-pulse" />
          <div
            className="absolute -bottom-1/4 -right-1/4 w-[700px] h-[700px] rounded-full bg-cyber-purple/10 blur-[120px] animate-glow-pulse"
            style={{ animationDelay: '1.5s' }}
          />
        </div>
        <div className="bg-grid absolute inset-0 -z-10 opacity-40" />

        {children}
      </body>
    </html>
  );
}
