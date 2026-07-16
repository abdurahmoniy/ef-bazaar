'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { AlertTriangle, Handshake, ShieldCheck, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatPriceUZS } from '@/lib/marketplace-format';
import type { ChatResponse, ListingResponse } from '@/lib/marketplace-types';
import {
  TRADE_STATE_LABEL_UZ,
  type CardResponse,
  type ProposalAcceptRequest,
  type ProposalCreateRequest,
  type ProposalResponse,
  type TradeResponse,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';

interface TradePanelProps {
  chat: ChatResponse;
  viewerId: string;
  listing: ListingResponse | null;
}

/**
 * Minimum-viable trade driver rendered above the chat message stream. Handles
 * only the first hop of the trade lifecycle so the end-to-end Kafka pipeline
 * (smart-admin-worker → Mailcow → Telegram log) can be exercised from the
 * browser without curl:
 *
 *   1. Seller posts a proposal (price + card).
 *   2. Buyer accepts (their card) → trade opens → INITIATED → WAITING_PAYMENT.
 *
 * States past WAITING_PAYMENT are display-only; per-state actions land in a
 * follow-up PR.
 */
export function TradePanel({ chat, viewerId, listing }: TradePanelProps) {
  const router = useRouter();
  const isSeller = chat.sellerId === viewerId;
  const otherPartyId = isSeller ? chat.buyerId : chat.sellerId;

  const [trades, setTrades] = useState<TradeResponse[] | null>(null);
  const [proposal, setProposal] = useState<PendingProposal | null>(null);
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const activeTrade = trades && trades.length > 0 ? trades[0] : null;

  const reload = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await fetchTradesByChat(chat.id);
      setTrades(list);
    } finally {
      setRefreshing(false);
    }
  }, [chat.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleProposalCreated = useCallback(
    (p: ProposalResponse, priceUzs: number) => {
      setProposal({ id: p.proposalId, priceUzs, expiresAt: p.expiresAt });
      setShowProposeModal(false);
      // A proposal being created doesn't open a trade yet (that happens on
      // accept), so no trade to refetch — just close and show the pending card.
    },
    [],
  );

  const handleProposalAccepted = useCallback(async () => {
    setProposal(null);
    setShowAcceptModal(false);
    await reload();
    router.refresh();
  }, [reload, router]);

  // Nothing to render while the first fetch is in flight — avoid a
  // seller-only flash before we know the trade state.
  if (trades === null) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-muted/30 px-4 py-3 text-[11.5px] text-muted-foreground">
        Savdo holati yuklanmoqda…
      </div>
    );
  }

  // ---- active trade (post-accept) — read-only status card ----
  if (activeTrade) {
    return (
      <ActiveTradeCard trade={activeTrade} onRefresh={reload} refreshing={refreshing} />
    );
  }

  // ---- pending proposal (post-create, pre-accept) ----
  if (proposal) {
    return (
      <PendingProposalCard
        proposal={proposal}
        isSeller={isSeller}
        onAcceptClick={() => setShowAcceptModal(true)}
        onDismiss={() => setProposal(null)}
        showAcceptModal={showAcceptModal}
        onAcceptModalClose={() => setShowAcceptModal(false)}
        onAccepted={handleProposalAccepted}
      />
    );
  }

  // ---- no trade, no pending proposal ----
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Handshake className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Savdo
          </p>
          <p className="text-sm font-semibold text-foreground">
            {isSeller ? 'Xaridorga taklif yuboring' : 'Sotuvchi taklifini kuting'}
          </p>
        </div>
      </div>
      {isSeller ? (
        <>
          <Button
            type="button"
            className="w-full"
            onClick={() => setShowProposeModal(true)}
          >
            Taklif yuborish
          </Button>
          {showProposeModal && (
            <ProposeModal
              chat={chat}
              viewerId={viewerId}
              listing={listing}
              otherPartyId={otherPartyId}
              onClose={() => setShowProposeModal(false)}
              onCreated={handleProposalCreated}
            />
          )}
        </>
      ) : (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Sotuvchi hali taklif yubormagan.
        </p>
      )}
    </div>
  );
}

// -------------------- active trade --------------------

function ActiveTradeCard({
  trade,
  onRefresh,
  refreshing,
}: {
  trade: TradeResponse;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const shortId = trade.id.slice(0, 8);
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Savdo · {shortId}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {formatPriceUZS(trade.priceUzs)}
          </p>
        </div>
        <Badge variant="verified">{TRADE_STATE_LABEL_UZ[trade.state]}</Badge>
      </div>
      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span>Rol: {trade.role === 'SELLER' ? 'Sotuvchi' : trade.role === 'BUYER' ? 'Xaridor' : '—'}</span>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="text-primary underline underline-offset-2 disabled:opacity-50"
        >
          {refreshing ? 'Yangilanmoqda…' : 'Yangilash'}
        </button>
      </div>
    </div>
  );
}

// -------------------- pending proposal --------------------

interface PendingProposal {
  id: string;
  priceUzs: number;
  expiresAt: string;
}

function PendingProposalCard({
  proposal,
  isSeller,
  onAcceptClick,
  onDismiss,
  showAcceptModal,
  onAcceptModalClose,
  onAccepted,
}: {
  proposal: PendingProposal;
  isSeller: boolean;
  onAcceptClick: () => void;
  onDismiss: () => void;
  showAcceptModal: boolean;
  onAcceptModalClose: () => void;
  onAccepted: () => void;
}) {
  return (
    <div className="mx-auto max-w-md rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3 shadow-card">
      <div className="mb-2 flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Handshake className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-primary">
            Taklif yuborildi
          </p>
          <p className="text-sm font-semibold text-foreground">
            {formatPriceUZS(proposal.priceUzs)}
          </p>
        </div>
      </div>
      {isSeller ? (
        <p className="rounded-lg bg-white/60 px-3 py-2 text-xs text-muted-foreground">
          Xaridor javobini kutmoqda.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          <Button type="button" className="flex-1" onClick={onAcceptClick}>
            Qabul qilish
          </Button>
          <Button type="button" variant="ghost" onClick={onDismiss}>
            Yashirish
          </Button>
        </div>
      )}
      {showAcceptModal && !isSeller && (
        <AcceptModal
          proposal={proposal}
          onClose={onAcceptModalClose}
          onAccepted={onAccepted}
        />
      )}
    </div>
  );
}

// -------------------- propose modal --------------------

function ProposeModal({
  chat,
  viewerId,
  listing,
  otherPartyId,
  onClose,
  onCreated,
}: {
  chat: ChatResponse;
  viewerId: string;
  listing: ListingResponse | null;
  otherPartyId: string;
  onClose: () => void;
  onCreated: (p: ProposalResponse, priceUzs: number) => void;
}) {
  const initialPrice = listing ? String(Math.trunc(Number(listing.price))) : '';
  const [price, setPrice] = useState(initialPrice);
  const [cards, setCards] = useState<CardResponse[] | null>(null);
  const [cardId, setCardId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetchCards().then((list) => {
      if (cancelled) return;
      setCards(list);
      if (list.length > 0) setCardId(list[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceUzs = Number(price);
    if (!Number.isFinite(priceUzs) || priceUzs <= 0) {
      setError("Narx musbat butun son bo'lishi kerak");
      return;
    }
    if (!cardId) {
      setError('Karta tanlang');
      return;
    }
    const payload: ProposalCreateRequest = {
      marketplaceChatId: chat.id,
      otherPartyUserId: otherPartyId,
      sellerId: viewerId,
      buyerId: otherPartyId,
      amountUzs: priceUzs,
      cardId,
      listingId: listing?.id ?? null,
    };
    startSubmit(async () => {
      const result = await postProposal(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.data, priceUzs);
    });
  }

  return (
    <ModalShell title="Taklif yuborish" onClose={onClose}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div>
          <Label htmlFor="trade-price">Narx (UZS)</Label>
          <Input
            id="trade-price"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="500000"
            required
          />
        </div>
        <div>
          <Label htmlFor="trade-seller-card">Sotuvchi kartasi</Label>
          <CardSelect
            id="trade-seller-card"
            cards={cards}
            value={cardId}
            onChange={setCardId}
          />
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={submitting || cards === null}>
            {submitting ? 'Yuborilmoqda…' : 'Yuborish'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// -------------------- accept modal --------------------

function AcceptModal({
  proposal,
  onClose,
  onAccepted,
}: {
  proposal: PendingProposal;
  onClose: () => void;
  onAccepted: () => void;
}) {
  const [cards, setCards] = useState<CardResponse[] | null>(null);
  const [cardId, setCardId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    let cancelled = false;
    fetchCards().then((list) => {
      if (cancelled) return;
      setCards(list);
      if (list.length > 0) setCardId(list[0].id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!cardId) {
      setError('Karta tanlang');
      return;
    }
    const payload: ProposalAcceptRequest = { cardId };
    startSubmit(async () => {
      const result = await postProposalAccept(proposal.id, payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onAccepted();
    });
  }

  return (
    <ModalShell title="Taklifni qabul qilish" onClose={onClose}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <p>
            <span className="font-semibold text-foreground">Narx:</span>{' '}
            {formatPriceUZS(proposal.priceUzs)}
          </p>
          <p className="mt-0.5">Tasdiqlagach savdo boshlanadi.</p>
        </div>
        <div>
          <Label htmlFor="accept-card">Sizning kartangiz</Label>
          <CardSelect id="accept-card" cards={cards} value={cardId} onChange={setCardId} />
        </div>
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={submitting || cards === null}>
            {submitting ? 'Tasdiqlanmoqda…' : 'Tasdiqlash'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// -------------------- shared UI bits --------------------

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-4 shadow-card-hover">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-foreground">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={onClose}
            aria-label="Yopish"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CardSelect({
  id,
  cards,
  value,
  onChange,
}: {
  id: string;
  cards: CardResponse[] | null;
  value: string;
  onChange: (id: string) => void;
}) {
  const options = useMemo(() => cards ?? [], [cards]);
  if (cards === null) {
    return (
      <Select id={id} disabled>
        <option>Kartalar yuklanmoqda…</option>
      </Select>
    );
  }
  if (options.length === 0) {
    return (
      <div
        className={cn(
          'rounded-lg border border-input bg-muted/40 px-4 py-3 text-xs text-muted-foreground',
        )}
      >
        Saqlangan kartangiz yo'q. Avval kartani qo'shing.
      </div>
    );
  }
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((c) => (
        <option key={c.id} value={c.id}>
          {c.brand} · **** {c.last4} ({String(c.expiryMonth).padStart(2, '0')}/
          {String(c.expiryYear).slice(-2)})
        </option>
      ))}
    </Select>
  );
}

// -------------------- client-side fetchers --------------------

async function fetchTradesByChat(chatId: string): Promise<TradeResponse[]> {
  const response = await fetch(
    `/api/trade/v1/trades?chatId=${encodeURIComponent(chatId)}`,
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  if (!response.ok) return [];
  return (await response.json()) as TradeResponse[];
}

async function fetchCards(): Promise<CardResponse[]> {
  const response = await fetch('/api/trade/v1/cards', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) return [];
  return (await response.json()) as CardResponse[];
}

type MutationResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function postProposal(
  payload: ProposalCreateRequest,
): Promise<MutationResult<ProposalResponse>> {
  const response = await fetch('/api/trade/v1/trades/proposals', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true, data: (await response.json()) as ProposalResponse };
}

async function postProposalAccept(
  proposalId: string,
  payload: ProposalAcceptRequest,
): Promise<MutationResult<TradeResponse>> {
  const response = await fetch(
    `/api/trade/v1/trades/proposals/${encodeURIComponent(proposalId)}/accept`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true, data: (await response.json()) as TradeResponse };
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
