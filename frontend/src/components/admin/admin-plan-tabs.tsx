'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/utils';

const TABS = [
  { href: '/admin/plans/prices', label: 'Narxlar' },
  { href: '/admin/plans/mailboxes', label: 'Mailboxlar' },
];

export function AdminPlanTabs() {
  const pathname = usePathname();
  return (
    <nav aria-label="Tariflar bo‘limlari" className="flex gap-1 border-b border-border">
      {TABS.map((tab) => {
        const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px inline-flex min-h-11 items-center border-b-[3px] px-4 text-sm font-bold transition',
              active
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
