import type { Metadata } from 'next';
import Link from 'next/link';

import { Logo } from '@/components/brand/logo';

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: true,
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="container py-6">
        <Logo size="md" />
      </header>

      <main className="flex-1 container flex items-center justify-center pb-12">
        <div className="w-full max-w-md">{children}</div>
      </main>

      <footer className="container py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} efBazaar •{' '}
        <Link href="/" className="hover:text-foreground transition-colors">
          Bosh sahifa
        </Link>
      </footer>
    </div>
  );
}
