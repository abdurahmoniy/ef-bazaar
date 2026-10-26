'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Mail, Star, UserCog } from 'lucide-react';

import { CountdownText } from '@/components/trade-admin/countdown-text';
import { HumanTradeChecklist } from '@/components/trade-admin/human-trade-checklist';
import { HumanTradeMessages } from '@/components/trade-admin/human-trade-messages';
import { TradeAdminPicker } from '@/components/trade-admin/trade-admin-picker';
import { SellerRatingForm } from '@/components/chat/seller-rating-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { buildTradeApiPath } from '@/lib/trade-client-api';
import { validateAdminFee } from '@/lib/trade-human';
import {
  isTerminalState,
  TRADE_STATE_LABEL_UZ,
  type TradeAdminCardResponse,
  type TradeResponse,
  type TradeStepResponse,
} from '@/lib/trade-types';

const POLL_INTERVAL_MS = 5000;

export function HumanPartyTradePanel({
  trade,
  viewerId,
  onRefresh,
}: {
  trade: TradeResponse;
  viewerId: string;
  onRefresh: () => Promise<void> | void;
}) {
  const [steps, setSteps] = useState<TradeStepResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState({
    seller: Boolean(trade.sellerConfirmedAt),
    buyer: Boolean(trade.buyerConfirmedAt),
  });
  const [pending, startTransition] = useTransition();

  const isSeller = trade.sellerId === viewerId;
  const myConfirmed = isSeller ? confirmed.seller : confirmed.buyer;
  const otherConfirmed = isSeller ? confirmed.buyer : confirmed.seller;
  const chatEnabled = trade.state !== 'WAITING_ADMIN';
  const terminal = isTerminalState(trade.state);

  const reloadSteps = useCallback(async () => {
    const result = await fetchSteps(trade.id);
    if (result.ok) {
      setSteps(result.data);
      setError(null);
    } else {
      setError(result.error);
      setSteps((prev) => prev ?? []);
    }
  }, [trade.id]);

  useEffect(() => {
    void reloadSteps();
    if (terminal) return;
    const id = window.setInterval(() => void reloadSteps(), POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [reloadSteps, terminal]);

  useEffect(() => {
    setConfirmed({
      seller: Boolean(trade.sellerConfirmedAt),
      buyer: Boolean(trade.buyerConfirmedAt),
    });
  }, [trade.sellerConfirmedAt, trade.buyerConfirmedAt]);

  function confirmClose() {
    setError(null);
    startTransition(async () => {
      const result = await postCloseConfirm(trade.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setConfirmed({ seller: result.data.sellerConfirmed, buyer: result.data.buyerConfirmed });
      await onRefresh();
    });
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 rounded-lg border border-border bg-card p-3 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Inson admin savdosi
            </p>
            <p className="text-sm font-black text-foreground">{TRADE_STATE_LABEL_UZ[trade.state]}</p>
          </div>
        </div>
        <Badge variant="info">Platforma komissiyasi yo'q</Badge>
      </div>

      <div className="rounded-lg border border-warning-border bg-warning-soft px-3 py-2 text-xs text-warning">
        Xaridor to'lovni admin bilan bevosita qiladi. Platforma pulni ushlab turmaydi;
        admin reputatsiyasi va ratingi asosiy ishonch belgisi.
      </div>

      {trade.mailboxEmail && (
        <div className="flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-xs">
          <Mail className="h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="font-bold text-foreground">Platforma emaili</p>
            <code className="block truncate font-mono text-primary">{trade.mailboxEmail}</code>
          </div>
        </div>
      )}

      {trade.state === 'WAITING_ADMIN' && (
        <>
          <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Admin taklifni qabul qilishini kutmoqda.{' '}
            <CountdownText until={trade.stateDeadline} prefix="Qolgan vaqt:" />
          </div>
          {isSeller && <AssignAdminBox tradeId={trade.id} onRefresh={onRefresh} onError={setError} />}
        </>
      )}

      {trade.state === 'WAITING_CLOSE_CONFIRM' && (
        <CloseConfirmBox
          myConfirmed={myConfirmed}
          otherConfirmed={otherConfirmed}
          deadline={trade.stateDeadline}
          pending={pending}
          onConfirm={confirmClose}
        />
      )}

      {trade.state === 'SUCCESS' && (
        <div className="space-y-3">
          <SellerRatingForm tradeId={trade.id} isBuyer={!isSeller} />
          <RatingBox tradeId={trade.id} />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {steps === null ? (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checklist yuklanmoqda...
        </div>
      ) : (
        <HumanTradeChecklist steps={steps} />
      )}

      {chatEnabled && (
        <HumanTradeMessages
          tradeId={trade.id}
          target={isSeller ? 'SELLER' : 'BUYER'}
          title="Admin bilan chat"
          readOnly={terminal}
        />
      )}
    </div>
  );
}

function AssignAdminBox({
  tradeId,
  onRefresh,
  onError,
}: {
  tradeId: string;
  onRefresh: () => Promise<void> | void;
  onError: (message: string | null) => void;
}) {
  const [admin, setAdmin] = useState<TradeAdminCardResponse | null>(null);
  const [fee, setFee] = useState('');
  const [pending, startTransition] = useTransition();

  function assign() {
    const feeUzs = Number(fee);
    const validation = validateAdminFee(admin, feeUzs);
    if (!validation.ok) {
      onError(validation.error);
      return;
    }
    onError(null);
    startTransition(async () => {
      const result = await postAssignAdmin(tradeId, admin!.userId, feeUzs);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      await onRefresh();
    });
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div>
        <p className="text-sm font-black text-foreground">Adminni almashtirish</p>
        <p className="text-xs text-muted-foreground">
          Yangi admin tanlansa 24 soatlik kutish muddati qaytadan boshlanadi.
        </p>
      </div>
      <TradeAdminPicker
        value={admin?.userId}
        onSelect={(next) => {
          setAdmin(next);
          setFee(String(next.minFeeUzs));
        }}
      />
      <div>
        <Label htmlFor="assign-admin-fee">Xizmat narxi</Label>
        <Input
          id="assign-admin-fee"
          value={fee}
          onChange={(event) => setFee(event.target.value)}
          type="number"
          inputMode="numeric"
          min={1}
          placeholder="30000"
        />
        {admin && (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Ruxsat etilgan oraliq: {formatPriceUZS(admin.minFeeUzs)} -{' '}
            {formatPriceUZS(admin.maxFeeUzs)}
          </p>
        )}
      </div>
      <Button type="button" size="sm" onClick={assign} disabled={pending || !admin}>
        {pending ? 'Yuborilmoqda...' : 'Adminni taklif qilish'}
      </Button>
    </div>
  );
}

function CloseConfirmBox({
  myConfirmed,
  otherConfirmed,
  deadline,
  pending,
  onConfirm,
}: {
  myConfirmed: boolean;
  otherConfirmed: boolean;
  deadline: string | null;
  pending: boolean;
  onConfirm: () => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/25 bg-primary/5 p-3 text-xs">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-foreground">Admin savdoni yopdi</p>
          <p className="text-muted-foreground">
            Checklistni tekshirib tasdiqlang. 24 soat ichida javob bo'lmasa, sukut rozilik deb olinadi.
          </p>
          <p className="mt-1 font-semibold text-primary">
            <CountdownText until={deadline} prefix="Avto-yakun:" />
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={myConfirmed ? 'verified' : 'muted'}>
          Siz: {myConfirmed ? 'tasdiqladingiz' : 'kutilmoqda'}
        </Badge>
        <Badge variant={otherConfirmed ? 'verified' : 'muted'}>
          Qarshi taraf: {otherConfirmed ? 'tasdiqladi' : 'kutilmoqda'}
        </Badge>
      </div>
      <Button type="button" size="sm" onClick={onConfirm} disabled={pending || myConfirmed}>
        {pending ? 'Tasdiqlanmoqda...' : myConfirmed ? 'Tasdiqlangan' : 'Tasdiqlash'}
      </Button>
    </div>
  );
}

function RatingBox({ tradeId }: { tradeId: string }) {
  const [stars, setStars] = useState(5);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const starButtons = useMemo(() => Array.from({ length: 5 }, (_, index) => index + 1), []);

  function submit() {
    setMessage(null);
    startTransition(async () => {
      const result = await postRating(tradeId, stars, comment.trim() || undefined);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error });
        return;
      }
      setMessage({ tone: 'ok', text: 'Baho saqlandi' });
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
      <p className="text-sm font-black text-foreground">Adminni baholang</p>
      <div className="flex items-center gap-1">
        {starButtons.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setStars(value)}
            className="grid h-10 w-10 place-items-center rounded-lg text-warning transition hover:bg-warning-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`${value} yulduz`}
          >
            <Star className={value <= stars ? 'h-5 w-5 fill-current' : 'h-5 w-5'} />
          </button>
        ))}
      </div>
      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Izoh (ixtiyoriy)"
      />
      {message && (
        <p className={message.tone === 'ok' ? 'text-xs font-semibold text-primary' : 'text-xs font-semibold text-destructive'}>
          {message.text}
        </p>
      )}
      <Button type="button" size="sm" onClick={submit} disabled={pending}>
        {pending ? 'Saqlanmoqda...' : 'Baho berish'}
      </Button>
    </div>
  );
}

async function fetchSteps(
  tradeId: string,
): Promise<{ ok: true; data: TradeStepResponse[] } | { ok: false; error: string }> {
  try {
    const response = await fetch(buildTradeApiPath(['v1', 'trades', tradeId, 'steps']), {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return { ok: false, error: 'Checklist yuklanmadi' };
    return { ok: true, data: (await response.json()) as TradeStepResponse[] };
  } catch {
    return { ok: false, error: 'Checklist yuklanmadi' };
  }
}

async function postCloseConfirm(
  tradeId: string,
): Promise<{ ok: true; data: { sellerConfirmed: boolean; buyerConfirmed: boolean } } | { ok: false; error: string }> {
  const response = await fetch(
    buildTradeApiPath(['v1', 'trades', tradeId, 'actions', 'close-confirm']),
    {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return {
    ok: true,
    data: (await response.json()) as { sellerConfirmed: boolean; buyerConfirmed: boolean },
  };
}

async function postAssignAdmin(
  tradeId: string,
  adminId: string,
  feeUzs: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(
    buildTradeApiPath(['v1', 'trades', tradeId, 'actions', 'assign-admin']),
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ adminId, feeUzs }),
    },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true };
}

async function postRating(
  tradeId: string,
  stars: number,
  comment?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const response = await fetch(buildTradeApiPath(['v1', 'trades', tradeId, 'rating']), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ stars, comment }),
  });
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true };
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
