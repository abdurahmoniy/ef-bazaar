import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { AdminShell } from '@/components/admin/admin-shell';
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

  return <AdminShell user={user}>{children}</AdminShell>;
}

