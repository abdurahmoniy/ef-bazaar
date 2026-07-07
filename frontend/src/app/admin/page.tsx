import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  Flag,
  Package,
  Trash2,
  UsersRound,
  XCircle,
} from 'lucide-react';

import { ApiErrorPanel } from '@/components/marketplace/api-error-panel';
import { getAdminStats, getAdminUsers } from '@/lib/marketplace-server';

export const dynamic = 'force-dynamic';

export default async function AdminDashboardPage() {
  // Users live in auth-service — fetched separately from marketplace stats.
  const [result, usersResult] = await Promise.all([getAdminStats(), getAdminUsers(undefined, 0, 1)]);

  if (!result.ok) {
    return <ApiErrorPanel title="Statistika yuklanmadi" error={result.error} />;
  }

  const stats = result.data;

  const cards = [
    {
      label: 'Foydalanuvchilar',
      value: usersResult.ok ? usersResult.data.totalElements : '—',
      icon: <UsersRound className="h-5 w-5 text-primary" />,
      href: '/admin/users',
    },
    {
      label: "Jami e'lonlar",
      value: stats.totalListings,
      icon: <Package className="h-5 w-5 text-primary" />,
      href: '/admin/listings',
    },
    {
      label: "Aktiv e'lonlar",
      value: stats.activeListings,
      icon: <CheckCircle2 className="h-5 w-5 text-emerald-600" />,
      href: '/admin/listings?status=ACTIVE',
    },
    {
      label: 'Sotilgan',
      value: stats.soldListings,
      icon: <XCircle className="h-5 w-5 text-amber-600" />,
      href: '/admin/listings?status=SOLD',
    },
    {
      label: "O'chirilgan",
      value: stats.deletedListings,
      icon: <Trash2 className="h-5 w-5 text-destructive" />,
      href: '/admin/listings?status=DELETED',
    },
    {
      label: 'Jami shikoyatlar',
      value: stats.totalReports,
      icon: <Flag className="h-5 w-5 text-primary" />,
      href: '/admin/reports?status=all',
    },
    {
      label: 'Kutilayotgan shikoyatlar',
      value: stats.pendingReports,
      icon: <AlertTriangle className="h-5 w-5 text-destructive" />,
      href: '/admin/reports',
      highlight: stats.pendingReports > 0,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {cards.map((card) => (
        <Link
          key={card.label}
          href={card.href}
          className={
            card.highlight
              ? 'rounded-xl border border-destructive/40 bg-destructive/5 p-4 shadow-card transition hover:border-destructive'
              : 'rounded-xl border border-border bg-white p-4 shadow-card transition hover:border-primary/40'
          }
        >
          <div className="flex items-center justify-between gap-2">
            {card.icon}
            <span className="text-2xl font-black tabular-nums">{card.value}</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-muted-foreground">{card.label}</p>
        </Link>
      ))}
    </div>
  );
}
