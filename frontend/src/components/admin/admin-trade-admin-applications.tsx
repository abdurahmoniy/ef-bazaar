'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, Inbox, Mail, MessageSquareText, Send, UserCog, X } from 'lucide-react';

import {
  approveTradeAdminApplicationAction,
  rejectTradeAdminApplicationAction,
} from '@/app/admin/trade-admin-applications/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatListingDate } from '@/lib/marketplace-format';
import {
  tradeAdminApplicationStatusBadge,
  type TradeAdminApplicationResponse,
  type TradeAdminApplicationStatus,
  type TradeAdminApplicationStatusFilter,
} from '@/lib/trade-admin-applications';
import { cn } from '@/lib/utils';

const FILTERS: Array<{ value: TradeAdminApplicationStatusFilter; label: string }> = [
  { value: 'PENDING', label: 'Kutilmoqda' },
  { value: 'APPROVED', label: 'Tasdiqlangan' },
  { value: 'REJECTED', label: 'Rad etilgan' },
  { value: 'all', label: 'Hammasi' },
];

interface AdminTradeAdminApplicationsProps {
  applications: TradeAdminApplicationResponse[];
  activeStatus?: TradeAdminApplicationStatus;
}

export function AdminTradeAdminApplications({
  applications,
  activeStatus,
}: AdminTradeAdminApplicationsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function decide(application: TradeAdminApplicationResponse, action: 'approve' | 'reject') {
    const note = window.prompt(
      action === 'approve'
        ? 'Tasdiqlash izohi (ixtiyoriy)'
        : 'Rad etish sababi',
      action === 'approve' ? '' : application.decisionNote ?? '',
    );
    if (note === null) return;
    if (action === 'reject' && !note.trim()) {
      setError('Rad etish sababini yozing');
      return;
    }

    setBusyId(application.id);
    setError(null);
    startTransition(async () => {
      const result =
        action === 'approve'
          ? await approveTradeAdminApplicationAction(application.id, note)
          : await rejectTradeAdminApplicationAction(application.id, note);
      setBusyId(null);
      if (!result.ok) {
        setError(result.error);
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
              href={`/admin/trade-admin-applications?status=${filter.value}`}
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

      {applications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm font-semibold">Arizalar yo'q</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {applications.map((application) => {
            const badge = tradeAdminApplicationStatusBadge(application.status);
            const busy = isPending && busyId === application.id;
            const userSearch =
              application.applicantTelegramUsername ??
              application.applicantEmail ??
              application.applicantName ??
              application.applicantUserId;
            return (
              <li
                key={application.id}
                className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-black">
                        {application.applicantName ?? application.applicantUserId}
                      </span>
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
                      {application.applicantTelegramUsername && (
                        <span className="inline-flex items-center gap-1">
                          <Send className="h-3.5 w-3.5" />@{application.applicantTelegramUsername}
                        </span>
                      )}
                      {application.applicantEmail && (
                        <span className="inline-flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5" />
                          {application.applicantEmail}
                        </span>
                      )}
                      <span>{formatListingDate(application.createdAt)}</span>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/users?search=${encodeURIComponent(userSearch)}`}>
                      <UserCog className="h-4 w-4" />
                      User
                    </Link>
                  </Button>
                </div>

                <div className="rounded-lg border border-border bg-muted/20 px-3 py-2">
                  <p className="mb-1 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-muted-foreground">
                    <MessageSquareText className="h-3.5 w-3.5" />
                    Ariza matni
                  </p>
                  <p className="whitespace-pre-wrap text-sm text-foreground">{application.reason}</p>
                  {application.contact && (
                    <p className="mt-2 text-xs font-semibold text-muted-foreground">
                      Kontakt: <span className="text-foreground">{application.contact}</span>
                    </p>
                  )}
                </div>

                {application.decisionNote && (
                  <p className="rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground">
                    Qaror izohi: <span className="font-semibold text-foreground">{application.decisionNote}</span>
                  </p>
                )}

                {application.status === 'PENDING' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" disabled={busy} onClick={() => decide(application, 'approve')}>
                      <Check className="h-4 w-4" />
                      Tasdiqlash
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => decide(application, 'reject')}
                    >
                      <X className="h-4 w-4" />
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
