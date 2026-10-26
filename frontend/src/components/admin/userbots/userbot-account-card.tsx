'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { avatarUrl, UserbotApiError } from '@/lib/userbot-client';
import type { UserbotAccount } from '@/lib/userbot-types';
import {
  canReconnect, handleLine, initials, relativeAgo, sourceLabel, statusBadge, type BadgeTone,
} from '@/lib/userbot-view';
import { ConfirmDialog } from './confirm-dialog';

const TONE_CLASS: Record<BadgeTone, string> = {
  alive: 'bg-success-soft text-success',
  down: 'bg-warning-soft text-warning',
  revoked: 'bg-destructive/10 text-destructive',
  disconnected: 'bg-muted text-muted-foreground',
};

const DOT_CLASS: Record<BadgeTone, string> = {
  alive: 'bg-success',
  down: 'bg-warning',
  revoked: 'bg-destructive',
  disconnected: 'bg-muted-foreground',
};

interface UserbotAccountCardProps {
  account: UserbotAccount;
  now: Date | null;
  onDisconnect: (id: string) => Promise<void>;
  onReconnect: (account: UserbotAccount) => void;
}

export function UserbotAccountCard({ account, now, onDisconnect, onReconnect }: UserbotAccountCardProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = [account.firstName, account.lastName].filter(Boolean).join(' ');
  const badge = statusBadge(account);
  const bound = account.features.length > 0;
  const lost = account.status === 'REVOKED' || account.status === 'DISCONNECTED';
  const runner = account.runner === 'payment' ? 'userbot-payment' : account.runner === 'core' ? 'userbot-core' : '—';

  const closeConfirm = () => {
    if (busy) return;
    setConfirming(false);
    setError(null);
  };

  const confirmDisconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      await onDisconnect(account.id);
      setConfirming(false);
    } catch (e) {
      setError(e instanceof UserbotApiError ? e.message : "Tarmoq xatosi. Qayta urinib ko'ring.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          {account.hasAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarUrl(account.id)} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground">
              {initials(account.firstName, account.lastName)}
            </div>
          )}
          <span className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-card ${DOT_CLASS[badge.tone]}`} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-bold">{name}</h3>
          <p className="truncate text-sm text-muted-foreground">{handleLine(account)}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASS[badge.tone]}`}>
          {badge.label}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {account.features.map((f) => (
          <span key={f} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">{f}</span>
        ))}
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
          {sourceLabel(account)}
        </span>
      </div>

      {lost && (
        <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
          {`Sessiya Telegram'da yopilgan${account.statusReason ? ` (${account.statusReason})` : ''}. Qayta ulang.`}
        </div>
      )}

      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Oxirgi signal</dt>
          <dd className="font-medium">{now ? relativeAgo(account.lastHeartbeat, now) : '—'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Ishlayapti</dt>
          <dd className="font-medium">{runner}</dd>
        </div>
      </dl>

      <div className="flex flex-wrap items-center gap-3">
        {canReconnect(account) && (
          <Button type="button" onClick={() => onReconnect(account)}>Qayta ulash</Button>
        )}
        {account.status !== 'DISCONNECTED' && (
          <>
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={bound}
              onClick={() => setConfirming(true)}
            >
              Uzish
            </Button>
            {bound && <span className="text-xs text-muted-foreground">Biriktirilgan — uzib bo&apos;lmaydi</span>}
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirming}
        title={`${name}'ni uzish`}
        body="Sessiya Telegram tomonida ham yopiladi. Qayta ishlatish uchun akkountni boshidan ulash kerak bo'ladi."
        confirmLabel="Uzish"
        destructive
        busy={busy}
        error={error}
        onConfirm={confirmDisconnect}
        onCancel={closeConfirm}
      />
    </article>
  );
}
