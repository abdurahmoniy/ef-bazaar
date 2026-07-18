import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={inter.variable}>
      <body className="font-sans">{children}</body>
    </html>
  );
}
