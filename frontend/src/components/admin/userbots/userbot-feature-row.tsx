'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';

import { UserbotApiError } from '@/lib/userbot-client';
import type { UserbotAccount, UserbotFeature } from '@/lib/userbot-types';
import { bindable } from '@/lib/userbot-view';
import { ConfirmDialog } from './confirm-dialog';

const DESCRIPTIONS: Record<string, string> = {
  PAYMENT: 'Humo bot chatini kuzatadi va kartalarga tushgan pulni hamyonlarga yozadi.',
};

interface UserbotFeatureRowProps {
  feature: UserbotFeature;
  accounts: UserbotAccount[];
  onBind: (accountId: string) => Promise<void>;
}

const nameOf = (a: UserbotAccount | undefined) =>
  a ? [a.firstName, a.lastName].filter(Boolean).join(' ') : '';

export function UserbotFeatureRow({ feature, accounts, onBind }: UserbotFeatureRowProps) {
  const [pending, setPending] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = bindable(accounts);
  const current = accounts.find((a) => a.id === feature.accountId);
  const next = options.find((a) => a.id === pending);
  const description = DESCRIPTIONS[feature.feature] ?? '';

  const body = current
    ? `${feature.feature} vazifasi ${nameOf(current)}dan ${nameOf(next)}ga o'tkaziladi. Ish bir necha soniyaga to'xtashi mumkin.`
    : `To'lovlarni kuzatish ${nameOf(next)} ga biriktiriladi.`;

  const cancel = () => {
    if (busy) return;
    setPending(null);
    setError(null);
  };

  const confirm = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      await onBind(pending);
      setPending(null);
    } catch (e) {
      setError(e instanceof UserbotApiError ? e.message : "Tarmoq xatosi. Qayta urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <CreditCard className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold">{feature.title}</h3>
            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{feature.feature}</span>
          </div>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
      </div>
      <label className="flex flex-col gap-1 text-sm sm:w-64">
        <span className="text-muted-foreground">Ishlaydigan userbot</span>
        <select
          className="h-11 w-full rounded-lg border border-input bg-card px-3 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          value={feature.accountId ?? ''}
          onChange={(e) => {
            if (e.target.value && e.target.value !== feature.accountId) setPending(e.target.value);
          }}
        >
          <option value="" disabled>Userbotni tanlang</option>
          {options.map((a) => (
            <option key={a.id} value={a.id}>{nameOf(a)}</option>
          ))}
        </select>
      </label>
      <ConfirmDialog
        open={pending !== null && next !== undefined}
        title={`${feature.feature} vazifasini o'tkazish`}
        body={body}
        confirmLabel="O'tkazish"
        busy={busy}
        error={error}
        onConfirm={confirm}
        onCancel={cancel}
      />
    </div>
  );
}
