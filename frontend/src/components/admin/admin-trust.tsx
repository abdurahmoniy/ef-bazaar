'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Check, Inbox, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  adminConfirmTrustComplaint,
  adminRejectTrustComplaint,
} from '@/lib/marketplace-actions';
import { formatListingDate } from '@/lib/marketplace-format';
import {
  TRUST_CATEGORY_LABELS,
  TRUST_CONTEXT_LABELS,
  type TrustComplaint,
  type TrustComplaintStatus,
} from '@/lib/gamer-types';
import { cn } from '@/lib/utils';

interface AdminTrustProps {
  complaints: TrustComplaint[];
  activeStatus?: TrustComplaintStatus;
}

const FILTERS: Array<{ value: TrustComplaintStatus | 'all'; label: string }> = [
  { value: 'PENDING', label: 'Kutilmoqda' },
  { value: 'CONFIRMED', label: 'Tasdiqlangan' },
  { value: 'REJECTED', label: 'Rad etilgan' },
  { value: 'all', label: 'Hammasi' },
];

const STATUS_BADGES: Record<TrustComplaintStatus, { label: string; className: string }> = {
  PENDING: { label: 'Kutilmoqda', className: 'bg-amber-100 text-amber-800' },
  CONFIRMED: { label: 'Tasdiqlangan', className: 'bg-emerald-100 text-emerald-800' },
  REJECTED: { label: 'Rad etilgan', className: 'bg-muted text-muted-foreground' },
};

/**
 * Confirm → penalty engine avtomatik jazoni yozadi (3-tasdiq → TEMP_BLOCK,
 * 5+ → PERM_BLOCK; TrustService.confirm). Reject → complainant hisobiga
 * yoziladi (3 rad → o'ziga WARNING).
 */
export function AdminTrust({ complaints, activeStatus }: AdminTrustProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function act(complaintId: string, action: 'confirm' | 'reject') {
    setBusyId(complaintId);
    setError(null);
    startTransition(async () => {
      const result =
        action === 'confirm'
          ? await adminConfirmTrustComplaint(complaintId)
          : await adminRejectTrustComplaint(complaintId);
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
              href={`/admin/trust?status=${filter.value}`}
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

      {complaints.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-12 text-muted-foreground">
          <Inbox className="h-8 w-8" />
          <p className="text-sm font-semibold">Shikoyatlar yo&apos;q</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {complaints.map((c) => {
            const badge = STATUS_BADGES[c.status];
            const busy = isPending && busyId === c.id;
            const evidenceCount = c.evidenceMessageIds?.length ?? 0;
            return (
              <li
                key={c.id}
                className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-card"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-black uppercase tracking-wide text-destructive">
                      {TRUST_CATEGORY_LABELS[c.category] ?? c.category}
                    </span>
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-black uppercase tracking-wide text-muted-foreground">
                      {TRUST_CONTEXT_LABELS[c.contextType] ?? c.contextType} · {c.contextId}
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
                    {formatListingDate(c.createdAt)}
                  </time>
                </div>

                {c.details && <p className="text-sm text-foreground">{c.details}</p>}

                <dl className="space-y-1 text-sm text-muted-foreground">
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">Ayblanuvchi:</dt>
                    <dd>
                      <Link
                        href={`/gamers/${c.accusedId}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {c.accusedId}
                      </Link>
                    </dd>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <dt className="font-semibold">Shikoyatchi:</dt>
                    <dd>
                      <Link
                        href={`/gamers/${c.complainantId}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {c.complainantId}
                      </Link>
                    </dd>
                  </div>
                  {evidenceCount > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      <dt className="font-semibold">Dalil:</dt>
                      <dd className="text-foreground">
                        {evidenceCount} ta Telegram media (message_id: {c.evidenceMessageIds!.join(', ')})
                      </dd>
                    </div>
                  )}
                </dl>

                {c.status === 'PENDING' && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    <Button size="sm" disabled={busy} onClick={() => act(c.id, 'confirm')}>
                      <Check className="mr-1.5 h-4 w-4" />
                      Tasdiqlash
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => act(c.id, 'reject')}
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
