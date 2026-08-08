'use client';

import { useMemo, useState, useTransition } from 'react';
import { AlertTriangle, EyeOff, RefreshCw, Search, ShieldAlert, UserCog, XCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import { buildTradeApiPath } from '@/lib/trade-client-api';
import { validateAdminFee } from '@/lib/trade-human';
import {
  type EscalatedTradeResponse,
  type TradeAdminCardResponse,
  type TradeAdminRatingResponse,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';

export function AdminHumanTrades({
  initialEscalated,
  admins,
}: {
  initialEscalated: EscalatedTradeResponse[];
  admins: TradeAdminCardResponse[];
}) {
  const [escalated, setEscalated] = useState(initialEscalated);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      const result = await fetchEscalated();
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setEscalated(result.data);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-black text-foreground">Inson admin savdolari</h1>
          <p className="text-sm text-muted-foreground">
            Eskalatsiya, qayta tayinlash, bekor qilish va rating izohlarini moderatsiya qilish.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={reload} disabled={pending}>
          <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
          Yangilash
        </Button>
      </div>

      {message && (
        <p
          className={cn(
            'rounded-lg border px-3 py-2 text-sm font-semibold',
            message.tone === 'ok'
              ? 'border-primary/25 bg-primary/5 text-primary'
              : 'border-destructive/25 bg-destructive/5 text-destructive',
          )}
        >
          {message.text}
        </p>
      )}

      <section className="rounded-lg border border-border bg-card p-4 shadow-card">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-amber-500" />
          <h2 className="text-sm font-black text-foreground">Eskalatsiya queue</h2>
        </div>

        {escalated.length === 0 ? (
          <div className="mt-3 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Eskalatsiyadagi savdo yo'q.
          </div>
        ) : (
          <ul className="mt-3 space-y-3">
            {escalated.map((trade) => (
              <EscalatedRow
                key={trade.id}
                trade={trade}
                admins={admins}
                onChanged={reload}
                onMessage={setMessage}
              />
            ))}
          </ul>
        )}
      </section>

      <RatingModeration admins={admins} onMessage={setMessage} />
    </div>
  );
}

function EscalatedRow({
  trade,
  admins,
  onChanged,
  onMessage,
}: {
  trade: EscalatedTradeResponse;
  admins: TradeAdminCardResponse[];
  onChanged: () => void;
  onMessage: (message: { tone: 'ok' | 'error'; text: string }) => void;
}) {
  const fallbackAdmin = admins.find((admin) => !admin.busy) ?? admins[0];
  const [adminId, setAdminId] = useState(fallbackAdmin?.userId ?? '');
  const selectedAdmin = admins.find((admin) => admin.userId === adminId) ?? null;
  const [fee, setFee] = useState(String(selectedAdmin?.minFeeUzs ?? trade.adminFeeUzs ?? ''));
  const [reason, setReason] = useState('');
  const [pending, startTransition] = useTransition();

  function reassign() {
    const feeUzs = Number(fee);
    const feeValidation = validateAdminFee(selectedAdmin, feeUzs);
    if (!feeValidation.ok) {
      return onMessage({ tone: 'error', text: feeValidation.error });
    }
    startTransition(async () => {
      const result = await postReassign(trade.id, adminId, feeUzs);
      if (!result.ok) {
        onMessage({ tone: 'error', text: result.error });
        return;
      }
      onMessage({ tone: 'ok', text: 'Savdo qayta tayinlandi' });
      onChanged();
    });
  }

  function cancel() {
    if (!window.confirm('Savdo bekor qilinsinmi?')) return;
    startTransition(async () => {
      const result = await postCancel(trade.id, reason.trim() || undefined);
      if (!result.ok) {
        onMessage({ tone: 'error', text: result.error });
        return;
      }
      onMessage({ tone: 'ok', text: 'Savdo bekor qilindi' });
      onChanged();
    });
  }

  return (
    <li className="rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-black text-foreground">{formatPriceUZS(trade.priceUzs)}</p>
          <p className="text-[10.5px] text-muted-foreground">
            {trade.id.slice(0, 8)} · eskalatsiya: {formatListingDate(trade.escalatedAt)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Eski admin: {trade.assignedAdminId ?? 'yo\'q'} · sabab:{' '}
            {trade.escalationReason ?? 'ko\'rsatilmagan'}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-400/10 dark:text-amber-100">
          <AlertTriangle className="h-3.5 w-3.5" />
          Ko'rib chiqish kerak
        </div>
      </div>

      <div className="mt-3 grid gap-2 lg:grid-cols-[1fr,140px,1fr,auto,auto]">
        <Select
          value={adminId}
          onChange={(e) => {
            const next = admins.find((admin) => admin.userId === e.target.value) ?? null;
            setAdminId(e.target.value);
            if (next) setFee(String(next.minFeeUzs));
          }}
        >
          {admins.length === 0 ? (
            <option value="">Admin yo'q</option>
          ) : (
            admins.map((admin) => (
              <option key={admin.userId} value={admin.userId} disabled={admin.busy}>
                {admin.displayName || admin.userId} · {formatPriceUZS(admin.minFeeUzs)}
                {admin.busy ? ' · band' : ''}
              </option>
            ))
          )}
        </Select>
        <Input value={fee} onChange={(e) => setFee(e.target.value)} type="number" min={1} placeholder="Fee" />
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} placeholder="Bekor qilish sababi" />
        <Button type="button" onClick={reassign} disabled={pending || !adminId || selectedAdmin?.busy}>
          <UserCog className="h-4 w-4" />
          Reassign
        </Button>
        <Button type="button" variant="destructive" onClick={cancel} disabled={pending}>
          <XCircle className="h-4 w-4" />
          Cancel
        </Button>
      </div>
    </li>
  );
}

function RatingModeration({
  admins,
  onMessage,
}: {
  admins: TradeAdminCardResponse[];
  onMessage: (message: { tone: 'ok' | 'error'; text: string }) => void;
}) {
  const [adminId, setAdminId] = useState(admins[0]?.userId ?? '');
  const [ratings, setRatings] = useState<TradeAdminRatingResponse[] | null>(null);
  const [pending, startTransition] = useTransition();

  function load() {
    if (!adminId) return;
    startTransition(async () => {
      const result = await fetchRatings(adminId);
      if (!result.ok) {
        onMessage({ tone: 'error', text: result.error });
        return;
      }
      setRatings(result.data);
    });
  }

  function hide(ratingId: string) {
    startTransition(async () => {
      const result = await postHideRating(adminId, ratingId);
      if (!result.ok) {
        onMessage({ tone: 'error', text: result.error });
        return;
      }
      onMessage({ tone: 'ok', text: 'Izoh yashirildi. Yulduz reytingda qoladi.' });
      setRatings((prev) =>
        prev?.map((rating) => (rating.id === ratingId ? { ...rating, comment: null } : rating)) ?? prev,
      );
    });
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-center gap-2">
        <EyeOff className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-sm font-black text-foreground">Rating izohlari</h2>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Hide faqat izoh matnini yashiradi. Yulduz o'rtacha reytingda qoladi.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,auto]">
        <Select value={adminId} onChange={(e) => setAdminId(e.target.value)}>
          {admins.map((admin) => (
            <option key={admin.userId} value={admin.userId}>
              {admin.displayName || admin.userId}
            </option>
          ))}
        </Select>
        <Button type="button" variant="outline" onClick={load} disabled={pending || !adminId}>
          <Search className="h-4 w-4" />
          Yuklash
        </Button>
      </div>

      {ratings && (
        <ul className="mt-3 space-y-2">
          {ratings.length === 0 ? (
            <li className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
              Baho yo'q.
            </li>
          ) : (
            ratings.map((rating) => (
              <li key={rating.id} className="rounded-lg border border-border bg-muted/20 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-foreground">{rating.stars}/5 yulduz</p>
                    <p className="text-[10.5px] text-muted-foreground">
                      {rating.raterRole === 'SELLER' ? 'Sotuvchi' : 'Xaridor'} ·{' '}
                      {formatListingDate(rating.createdAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={pending || !rating.comment}
                    onClick={() => hide(rating.id)}
                  >
                    <EyeOff className="h-4 w-4" />
                    Izohni hide
                  </Button>
                </div>
                <p className="mt-2 text-sm text-foreground">
                  {rating.comment ?? 'Izoh yashirilgan, yulduz saqlangan.'}
                </p>
              </li>
            ))
          )}
        </ul>
      )}
    </section>
  );
}

async function fetchEscalated() {
  return fetchJson<EscalatedTradeResponse[]>(buildTradeApiPath('v1/admin/trades/escalated'));
}

async function postReassign(tradeId: string, adminId: string, feeUzs: number) {
  return fetchJson<unknown>(buildTradeApiPath(['v1', 'admin', 'trades', tradeId, 'reassign']), {
    method: 'POST',
    body: JSON.stringify({ adminId, feeUzs }),
  });
}

async function postCancel(tradeId: string, reason?: string) {
  return fetchJson<unknown>(buildTradeApiPath(['v1', 'admin', 'trades', tradeId, 'cancel']), {
    method: 'POST',
    body: JSON.stringify(reason ? { reason } : {}),
  });
}

async function fetchRatings(adminId: string) {
  return fetchJson<TradeAdminRatingResponse[]>(
    buildTradeApiPath(['v1', 'trade-admins', adminId, 'ratings']),
  );
}

async function postHideRating(adminId: string, ratingId: string) {
  return fetchJson<unknown>(
    buildTradeApiPath(['v1', 'admin', 'trade-admins', adminId, 'ratings', ratingId, 'hide']),
    { method: 'POST' },
  );
}

async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers as Record<string, string> | undefined),
      },
    });
    if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
    if (response.status === 204) return { ok: true, data: undefined as T };
    return { ok: true, data: (await response.json()) as T };
  } catch {
    return { ok: false, error: 'Trade API bilan aloqa yo\'q' };
  }
}

async function readErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: unknown; error?: unknown };
    if (typeof payload.message === 'string') return payload.message;
    if (typeof payload.error === 'string') return payload.error;
  } catch {
    // ignore
  }
  return response.status === 401 || response.status === 403
    ? 'Kirish talab qilinadi'
    : "So'rov bajarilmadi";
}
