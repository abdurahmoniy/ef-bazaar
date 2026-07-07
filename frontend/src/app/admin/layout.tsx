import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';

import { AdminTabs } from '@/components/admin/admin-tabs';
import { isAdmin } from '@/lib/admin';
import { getMe } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Admin panel',
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getMe();
  if (!user) redirect('/auth/login?from=/admin');
  if (!isAdmin(user)) redirect('/marketplace');

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-black">Admin panel</h1>
        </div>
        <Link
          href="/marketplace"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Marketplace
        </Link>
      </header>

      <AdminTabs />

      <main>{children}</main>
    </div>
  );
}
