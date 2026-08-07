'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, ExternalLink, Inbox, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  adminDismissReport,
  adminResolveReport,
} from '@/lib/marketplace-actions';
import { formatListingDate } from '@/lib/marketplace-format';
import type { AdminReportResponse, ReportStatus } from '@/lib/marketplace-types';
import { cn } from '@/lib/utils';

interface AdminReportsProps {
  reports: AdminReportResponse[];
  activeStatus?: ReportStatus;
}

const FILTERS: Array<{ value: ReportStatus | 'all'; label: string }> = [
  { value: 'PENDING', label: 'Kutilmoqda' },
  { value: 'RESOLVED', label: 'Hal qilingan' },
  { value: 'DISMISSED', label: 'Rad etilgan' },
  { value: 'all', label: 'Hammasi' },
];

const STATUS_BADGES: Record<ReportStatus, { label: string; className: string }> = {
  PENDING: { label: 'Kutilmoqda', className: 'bg-amber-100 text-amber-800' },
  RESOLVED: { label: 'Hal qilingan', className: 'bg-emerald-100 text-emerald-800' },
  DISMISSED: { label: 'Rad etilgan', className: 'bg-muted text-muted-foreground' },
};

export function AdminReports({ reports, activeStatus }: AdminReportsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function act(reportId: string, action: 'resolve' | 'dismiss') {
    setBusyId(reportId);
    setError(null);
    startTransition(async () => {
      const result =
        action === 'resolve'
          ? await adminResolveReport(reportId)
          : await adminDismissReport(reportId);
      setBusyId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <nav className="flex flex-wrap items-center gap-1.5">
        {FILTERS.map((filter) => {
          const isActive =
            filter.value === 'all' ? activeStatus === undefined : filter.value === activeStatus;
          return (
            <Link
              key={filter.value}
              href={`/admin/reports?status=${filter.value}`}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-semibold transition',
                isActive
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-semibold text-destructive">
          {error}
        </p>
      )}

      {reports.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm font-semibold">Shikoyatlar yo&apos;q</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {reports.map((report) => {
            const badge = STATUS_BADGES[report.status];
            const busy = isPending && busyId === report.id;
            return (
              <li
                key={report.id}
                className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-destructive">
                      {report.reason}
                    </span>
                    <span
                      className={cn(
                        'rounded-md px-2 py-0.5 text-xs font-black uppercase tracking-wide',
                        badge.className,
                      )}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <time className="text-xs font-semibold text-muted-foreground">
                    {formatListingDate(report.createdAt)}
                  </time>
                </div>

                {report.details && <p className="text-sm text-foreground">{report.details}</p>}

                <dl className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">Shikoyatchi:</dt>
                    <dd className="font-medium text-foreground">
                      {report.reporterName ?? report.reporterId}
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">E&apos;lon:</dt>
                    <dd className="min-w-0 font-medium text-foreground">
                      {report.listingDescription ? (
                        <Link
                          href={`/marketplace/${report.listingId}`}
                          className="inline-flex items-center gap-1 text-primary hover:underline"
                        >
                          <span className="line-clamp-1">{report.listingDescription}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                        </Link>
                      ) : (
                        "o'chirilgan"
                      )}
                      {report.sellerName && (
                        <span className="text-muted-foreground"> — sotuvchi: {report.sellerName}</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {report.status === 'PENDING' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => act(report.id, 'resolve')}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      Hal qilindi
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(report.id, 'dismiss')}
                    >
                      <X className="mr-1.5 h-4 w-4" />
                      Rad etish
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
