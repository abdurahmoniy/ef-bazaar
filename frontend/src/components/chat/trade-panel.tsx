'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Handshake,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserCog,
  X,
  XCircle,
} from 'lucide-react';

import {
  fetchAccountRequest,
  fetchPartnerListings,
  openAccountRequest,
  roleInRequest,
  type AccountRequest,
  type ChatListingOption,
} from '@/lib/account-request';
import { CountdownText } from '@/components/trade-admin/countdown-text';
import { HumanPartyTradePanel } from '@/components/trade-admin/human-party-trade-panel';
import { TradeAdminPicker } from '@/components/trade-admin/trade-admin-picker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatPriceUZS } from '@/lib/marketplace-format';
import type { ChatResponse, ListingResponse } from '@/lib/marketplace-types';
import { isHumanProposal, isHumanTrade, validateAdminFee } from '@/lib/trade-human';
import { createInvoice } from '@/lib/payment-client';
import { planPollTick } from '@/lib/trade-poll-plan';
import { isInsufficientFunds, shortfallSom, topUpHref } from '@/lib/wallet-shortfall';
import {
  isTerminalState,
  TRADE_STATE_LABEL_UZ,
  type PendingProposalResponse,
  type ProposalAcceptRequest,
  type ProposalCreateRequest,
  type ProposalResponse,
  type TradeAdminCardResponse,
  type TradeMode,
  type TradeResponse,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';
import { FEATURES } from '@/lib/feature-flags';
import { sellerProceedsSom, tradeFeeSom } from '@/lib/trade-commission';

/** Polling cadence for both trade-state and pending-proposal watchers. */
const POLL_INTERVAL_MS = 4000;

interface TradePanelProps {
  chat: ChatResponse;
  viewerId: string;
  listing: ListingResponse | null;
  /**
   * Server-fetched pending proposal for this chat, if any. Present for BOTH
   * seller and buyer on first render — fixes the bug where the buyer's
   * browser had no way to see a proposal the seller had already sent.
   */
  initialPendingProposal?: PendingProposalResponse | null;
}

/**
 * Full-lifecycle trade driver rendered above the chat message stream.
 *
 * Phase 1 (propose/accept) is unchanged. Once a trade is active this panel
 * renders state-conditional buttons — the buyer confirms payment, the seller
 * confirms the Konami email change, either side can retrigger IMAP verify,
 * the seller submits the Konami password, the buyer reveals it, then either
 * confirms or rejects. Each mutation triggers an immediate `reload` and a
 * background 4-second poll keeps state fresh without WebSockets.
 *
 * Reveal is one-shot — the plaintext lives in this component's React state
 * for as long as the buyer stays on the page.
 */
export function TradePanel({
  chat,
  viewerId,
  listing,
  initialPendingProposal = null,
}: TradePanelProps) {
  const router = useRouter();
  const otherPartyId = chat.sellerId === viewerId ? chat.buyerId : chat.sellerId;

  /**
   * Which account is being negotiated, and therefore who sells it.
   *
   * `chat.sellerId` only records who opened the conversation. Once the pair
   * trades a second time — possibly the other way round — it stops describing
   * the trade in hand, so the role comes from the account request instead.
   */
  const [accountRequest, setAccountRequest] = useState<AccountRequest | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const role = roleInRequest(accountRequest, viewerId);
  const isSeller = role === 'SELLER';

  const [trades, setTrades] = useState<TradeResponse[] | null>(null);
  const [proposal, setProposal] = useState<PendingProposal | null>(
    initialPendingProposal
        ? {
            id: initialPendingProposal.proposalId,
            priceUzs: initialPendingProposal.amountUzs,
            expiresAt: initialPendingProposal.expiresAt,
            mode: initialPendingProposal.mode ?? undefined,
            adminId: initialPendingProposal.adminId ?? undefined,
            adminFeeUzs: initialPendingProposal.adminFeeUzs ?? undefined,
          }
        : null,
  );
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** Guard against overlapping polls (setInterval fires while a fetch is in flight). */
  const reloadInFlight = useRef(false);
  const proposalPollInFlight = useRef(false);

  const activeTrade = trades && trades.length > 0 ? trades[0] : null;

  const reload = useCallback(async () => {
    if (reloadInFlight.current) return;
    reloadInFlight.current = true;
    setRefreshing(true);
    try {
      // Fetched together: the request decides which panel the trade renders in,
      // so loading them apart lets one arrive without the other and flashes the
      // counterparty's screen.
      const [list, request] = await Promise.all([
        fetchTradesByChat(chat.id),
        fetchAccountRequest(chat.id),
      ]);
      setTrades(list);
      setAccountRequest(request);
    } finally {
      setRefreshing(false);
      reloadInFlight.current = false;
    }
  }, [chat.id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // ---- polling: trade state while non-terminal ----
  // Key on primitives (id + state) so we don't tear down / re-create the
  // interval on every 4-second refetch. The interval is only reset when
  // the trade transitions to a new state or (rare) the trade id changes.
  const activeTradeId = activeTrade?.id ?? null;
  const activeTradeState = activeTrade?.state ?? null;
  useEffect(() => {
    if (!activeTradeId || !activeTradeState) return;
    if (isTerminalState(activeTradeState)) return;
    const id = window.setInterval(() => {
      void reload();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [activeTradeId, activeTradeState, reload]);

  // ---- polling: runs until a trade exists ----
  // Deliberately keeps polling while a proposal is pending. The other party can
  // accept at any moment, and the proposer has no action of their own to hang a
  // refresh on — the accept happens on the other browser. Bailing out here left
  // the seller parked on the pending-proposal card after the buyer accepted, so
  // they never saw the escrow mailbox address they were supposed to move the
  // account to, and the trade timed out unattended (trade 6c09400e).
  const hasProposal = proposal !== null;
  const hasActiveTrade = activeTrade !== null;
  useEffect(() => {
    if (planPollTick({ hasActiveTrade, hasProposal }) === 'stop') return;
    const tick = async () => {
      if (proposalPollInFlight.current) return;
      proposalPollInFlight.current = true;
      try {
        if (planPollTick({ hasActiveTrade, hasProposal }) === 'find-proposal') {
          const p = await fetchPendingProposal(chat.id);
          if (p) {
            setProposal({
              id: p.proposalId,
              priceUzs: p.amountUzs,
              expiresAt: p.expiresAt,
              mode: p.mode ?? undefined,
              adminId: p.adminId ?? undefined,
              adminFeeUzs: p.adminFeeUzs ?? undefined,
            });
            return;
          }
        }
        // Either the proposal was already known, or there is none to find —
        // either way it may have been accepted since the last tick, which is
        // what opens the trade.
        await reload();
      } finally {
        proposalPollInFlight.current = false;
      }
    };
    const id = window.setInterval(() => {
      void tick();
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [hasActiveTrade, hasProposal, chat.id, reload]);

  const handleProposalCreated = useCallback(
    (p: ProposalResponse, priceUzs: number, mode: TradeMode, adminFeeUzs?: number) => {
      setProposal({ id: p.proposalId, priceUzs, expiresAt: p.expiresAt, mode, adminFeeUzs });
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

  // ---- active trade (post-accept) — state-conditional actions ----
  if (activeTrade) {
    if (isHumanTrade(activeTrade)) {
      return (
        <HumanPartyTradePanel
          trade={activeTrade}
          viewerId={viewerId}
          onRefresh={reload}
        />
      );
    }

    return (
      <ActiveTradeCard
        trade={activeTrade}
        viewerId={viewerId}
        onRefresh={reload}
        refreshing={refreshing}
      />
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
            {role === null
              ? 'Qaysi akkount?'
              : isSeller
                ? 'Xaridorga taklif yuboring'
                : 'Sotuvchi taklifini kuting'}
          </p>
        </div>
      </div>

      {accountRequest && (
        <SelectedAccountCard
          request={accountRequest}
          isSeller={isSeller}
          onChange={() => setShowPicker(true)}
        />
      )}

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
              accountRequest={accountRequest}
              onClose={() => setShowProposeModal(false)}
              onCreated={handleProposalCreated}
            />
          )}
        </>
      ) : role === 'BUYER' ? (
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Sotuvchi hali taklif yubormagan.
        </p>
      ) : null}

      {/* Both sides get this. Either may be the one buying next, and a pair who
          already traded should not have to open a second chat to trade again. */}
      <Button
        type="button"
        variant={role === null ? 'default' : 'outline'}
        className="mt-2 w-full"
        onClick={() => setShowPicker(true)}
      >
        {role === null ? 'Akkount so’rash' : 'Boshqa akkount so’rash'}
      </Button>

      {showPicker && (
        <AccountPickerModal
          chatId={chat.id}
          onClose={() => setShowPicker(false)}
          onPicked={(req) => {
            setAccountRequest(req);
            setShowPicker(false);
          }}
        />
      )}
    </div>
  );
}

/** What the pair agreed to trade — shown to both, so neither has to guess. */
function SelectedAccountCard({
  request,
  isSeller,
  onChange,
}: {
  request: AccountRequest;
  isSeller: boolean;
  onChange: () => void;
}) {
  const listing = request.listing;
  return (
    <div className="mb-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">
        {isSeller ? 'So’ralgan akkount' : 'Siz so’ragan akkount'}
      </p>
      {listing ? (
        <>
          <p className="line-clamp-2 text-xs text-foreground">{listing.description}</p>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {formatPriceUZS(listing.price)}
          </p>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">E’lon o’chirilgan.</p>
      )}
      <button
        type="button"
        onClick={onChange}
        className="mt-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
      >
        O’zgartirish
      </button>
    </div>
  );
}

/** The partner's active listings. Picking one makes the picker the buyer. */
function AccountPickerModal({
  chatId,
  onClose,
  onPicked,
}: {
  chatId: string;
  onClose: () => void;
  onPicked: (request: AccountRequest) => void;
}) {
  const [options, setOptions] = useState<ChatListingOption[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  useEffect(() => {
    void (async () => setOptions(await fetchPartnerListings(chatId)))();
  }, [chatId]);

  function pick(listingId: string) {
    setError(null);
    startSave(async () => {
      const r = await openAccountRequest(chatId, listingId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onPicked(r.data);
    });
  }

  return (
    <ModalShell title="Akkount tanlang" onClose={onClose}>
      {error && (
        <p className="mb-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {options === null ? (
        <p className="text-xs text-muted-foreground">Yuklanmoqda…</p>
      ) : options.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Suhbatdoshingizda hozir aktiv e’lon yo’q.
        </p>
      ) : (
        <ul className="space-y-2">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                disabled={saving}
                onClick={() => pick(option.id)}
                className="w-full rounded-lg border border-border px-3 py-2 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
              >
                <span className="line-clamp-2 block text-xs text-foreground">
                  {option.description}
                </span>
                <span className="mt-1 block text-sm font-semibold text-foreground">
                  {formatPriceUZS(option.price)}
                  {option.priceNegotiable && (
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                      · kelishiladi
                    </span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  );
}

// -------------------- active trade --------------------

function ActiveTradeCard({
  trade,
  viewerId,
  onRefresh,
  refreshing,
}: {
  trade: TradeResponse;
  viewerId: string;
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
}) {
  const isBuyer = trade.buyerId === viewerId;
  const isSeller = trade.sellerId === viewerId;
  const shortId = trade.id.slice(0, 8);
  /**
   * Reveal is one-shot per spec — server returns 410 Gone on the second
   * call. We stash the plaintext in local state so the buyer can keep
   * looking at it while deciding to confirm/reject.
   */
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Clear any transient error when the state changes on its own.
  useEffect(() => {
    setActionError(null);
  }, [trade.state]);

  return (
    <div className="mx-auto max-w-md space-y-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-card">
      <div className="flex items-center gap-2">
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
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <Badge variant="verified">{TRADE_STATE_LABEL_UZ[trade.state]}</Badge>
          {/* Every non-terminal state runs on a stateDeadline the server set on
              entry, and missing it ORPHANs the trade. Showing it only in the
              human-admin panel meant a smart-trade seller had 30 minutes to
              move the account with no clock anywhere on screen. */}
          {trade.stateDeadline && !isTerminalState(trade.state) && (
            <span className="text-[10px] text-muted-foreground">
              <CountdownText until={trade.stateDeadline} prefix="Qoldi:" />
            </span>
          )}
        </div>
      </div>

      <TradeStateActions
        trade={trade}
        isBuyer={isBuyer}
        isSeller={isSeller}
        revealedPassword={revealedPassword}
        onRevealed={setRevealedPassword}
        onActionError={setActionError}
        onRefresh={onRefresh}
      />

      {actionError && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <span>
          Rol:{' '}
          {trade.role === 'SELLER'
            ? 'Sotuvchi'
            : trade.role === 'BUYER'
              ? 'Xaridor'
              : '—'}
        </span>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          className="text-primary underline underline-offset-2 disabled:opacity-50"
        >
          {refreshing ? 'Yangilanmoqda…' : 'Yangilash'}
        </button>
      </div>
    </div>
  );
}

// -------------------- state-conditional actions --------------------

interface StateActionProps {
  trade: TradeResponse;
  isBuyer: boolean;
  isSeller: boolean;
  revealedPassword: string | null;
  onRevealed: (pw: string) => void;
  onActionError: (msg: string | null) => void;
  onRefresh: () => Promise<void> | void;
}

function TradeStateActions({
  trade,
  isBuyer,
  isSeller,
  revealedPassword,
  onRevealed,
  onActionError,
  onRefresh,
}: StateActionProps) {
  switch (trade.state) {
    case 'INITIATED':
      return <InitiatedPanel />;
    case 'WAITING_PAYMENT':
      // Nobody acts here any more. The money was frozen when the buyer
      // accepted, and the trade moves on by itself — both sides just get told
      // where their money is.
      return isBuyer ? (
        <InfoBox>
          Pulingiz platformada saqlanmoqda. Savdo muvaffaqiyatli yakunlansa
          sotuvchiga o&apos;tkaziladi, bekor bo&apos;lsa to&apos;liq qaytariladi.
        </InfoBox>
      ) : (
        <InfoBox>
          Xaridorning puli platformada saqlanmoqda. Savdo yakunlangach
          hamyoningizga tushadi.
        </InfoBox>
      );
    case 'WAITING_EMAIL_CHANGE':
      return isSeller ? (
        <WaitingEmailChangeSellerPanel
          trade={trade}
          onActionError={onActionError}
          onRefresh={onRefresh}
        />
      ) : (
        <InfoBox>Sotuvchi email o&apos;zgartirishini kutmoqda.</InfoBox>
      );
    case 'VERIFYING_KONAMI_LINK':
      return isSeller ? (
        <VerifyingKonamiSellerPanel
          trade={trade}
          onActionError={onActionError}
          onRefresh={onRefresh}
        />
      ) : (
        <InfoBox>Konami tekshirilmoqda…</InfoBox>
      );
    case 'WAITING_PASSWORD':
      return isSeller ? (
        <WaitingPasswordSellerPanel
          trade={trade}
          onActionError={onActionError}
          onRefresh={onRefresh}
        />
      ) : (
        <InfoBox>Sotuvchi Konami parolini yuborishini kutmoqda.</InfoBox>
      );
    case 'WAITING_BUYER_VERIFY':
      return isBuyer ? (
        <WaitingBuyerVerifyBuyerPanel
          trade={trade}
          revealedPassword={revealedPassword}
          onRevealed={onRevealed}
          onActionError={onActionError}
          onRefresh={onRefresh}
        />
      ) : (
        <InfoBox>Xaridor tasdiqlashini kutmoqda.</InfoBox>
      );
    case 'SUCCESS':
      return <SuccessPanel trade={trade} />;
    case 'REJECTED':
      return (
        <TerminalBanner tone="destructive" icon={<XCircle className="h-4 w-4" />}>
          Savdo rad etildi.
        </TerminalBanner>
      );
    case 'ORPHANED':
      return (
        <TerminalBanner tone="muted" icon={<AlertTriangle className="h-4 w-4" />}>
          Savdo muddati tugadi.
        </TerminalBanner>
      );
    default:
      return null;
  }
}

// -------------------- per-state panels --------------------

function InitiatedPanel() {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      <span>Mailbox tayyorlanmoqda…</span>
    </div>
  );
}

function WaitingEmailChangeSellerPanel({
  trade,
  onActionError,
  onRefresh,
}: {
  trade: TradeResponse;
  onActionError: (msg: string | null) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [submitting, startSubmit] = useTransition();
  const [copied, setCopied] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const email = trade.mailboxEmail;
  const code = trade.emailChangeVerificationCode;

  function confirm() {
    onActionError(null);
    startSubmit(async () => {
      const r = await postTradeAction(trade.id, 'email-changed');
      if (!r.ok) {
        onActionError(r.error);
        return;
      }
      setShowModal(false);
      await onRefresh();
    });
  }

  async function copyEmail() {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can fail (permissions, http). Silent — user can select manually.
    }
  }

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // silent
    }
  }

  return (
    <div className="space-y-2">
      <div className="rounded-lg bg-primary/5 px-3 py-2 text-xs">
        <p className="mb-1 font-semibold text-foreground">Konami email manzili</p>
        {email ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-white/70 px-2 py-1 text-[11px] font-mono text-foreground">
              {email}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 px-2"
              onClick={copyEmail}
              aria-label="Nusxa olish"
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              {copied ? 'Nusxalandi' : 'Nusxa'}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">Manzil tayyorlanmoqda…</p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Konami saytiga kirib akkount email manzilini yuqoridagi manzilga
          o&apos;zgartiring.
        </p>
      </div>

      {/* Konami sends a 6-digit code to the escrow mailbox. Smart-admin's IMAP
          detector picks it up and populates emailChangeVerificationCode. The
          seller enters it on Konami to complete the email change, then presses
          the button below. */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        <p className="mb-1 font-semibold text-foreground">Konami tasdiqlash kodi</p>
        {code ? (
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded bg-white/70 px-2 py-1 text-center text-lg font-mono font-bold tracking-widest text-primary">
              {code}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 px-2"
              onClick={copyCode}
              aria-label="Kodni nusxa olish"
            >
              <Copy className="mr-1 h-3.5 w-3.5" />
              {codeCopied ? 'Nusxalandi' : 'Nusxa'}
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">
            Konami dan tasdiqlash kodini kutmoqda…
          </p>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Bu kodni Konami sahifasidagi email o&apos;zgartirish oynasiga
          kiriting.
        </p>
      </div>

      <Button
        type="button"
        className="w-full"
        onClick={() => setShowModal(true)}
        disabled={submitting || !email || !code}
        title={!code ? "Avval Konami tasdiqlash kodini kiriting va kuting" : undefined}
      >
        Email o&apos;zgartirdim
      </Button>
      {showModal && email && (
        <ConfirmModal
          title="Email o'zgarishini tasdiqlash"
          body={
            <p>
              Konami saytida email manzilini{' '}
              <code className="rounded bg-muted px-1 py-0.5 text-[11px]">
                {email}
              </code>{' '}
              ga o&apos;zgartirdingizmi?
            </p>
          }
          confirmLabel={submitting ? 'Tasdiqlanmoqda…' : 'Ha, tasdiqlayman'}
          submitting={submitting}
          onConfirm={confirm}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}

const KONAMI_FORGOT_URL = 'https://my.konami.net/en_US/password-reminder/input-email-address';

function VerifyingKonamiSellerPanel({
  trade,
  onActionError,
  onRefresh,
}: {
  trade: TradeResponse;
  onActionError: (msg: string | null) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [submitting, startSubmit] = useTransition();
  const [copied, setCopied] = useState(false);
  const konamiTabRef = useRef<Window | null>(null);

  const mailboxEmail = trade.mailboxEmail ?? '';
  // Try passing email as query param — Konami may auto-fill; if not seller pastes.
  const konamiHref = mailboxEmail
    ? `${KONAMI_FORGOT_URL}?email=${encodeURIComponent(mailboxEmail)}`
    : KONAMI_FORGOT_URL;

  // When the panel unmounts (state transitioned to WAITING_PASSWORD after
  // IMAP detected the reset email), close the Konami tab we opened. This
  // matches the seller's mental model: "I sent forgot-password, it's done,
  // I can go back to the trade panel."
  useEffect(() => {
    return () => {
      if (konamiTabRef.current && !konamiTabRef.current.closed) {
        try {
          konamiTabRef.current.close();
        } catch {
          // browser may block close if we didn't open the window; harmless
        }
      }
    };
  }, []);

  async function copyEmail() {
    if (!mailboxEmail) return;
    try {
      await navigator.clipboard.writeText(mailboxEmail);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard may be blocked — silent, seller can select manually
    }
  }

  function openKonami(ev: React.MouseEvent<HTMLButtonElement>) {
    ev.preventDefault();
    // window.open() gives us a reference we can close later. noopener isolates
    // the child window from ours (Konami cannot navigate/access this page).
    konamiTabRef.current = window.open(konamiHref, '_blank', 'noopener');
  }

  function recheck() {
    onActionError(null);
    startSubmit(async () => {
      const r = await postTradeAction(trade.id, 'recheck');
      if (!r.ok) {
        onActionError(r.error);
        return;
      }
      await onRefresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <p className="font-medium">Konami sahifasida forgot password so&apos;rang</p>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Pastdagi tugma orqali Konami forgot-password sahifasini oching.</li>
          <li>Sahifada quyidagi emailni kiriting (yoki nusxa oling) va &quot;Send&quot; tugmasini bosing.</li>
          <li>Konami xatni <b>{mailboxEmail || 'escrow mailbox'}</b> ga yuboradi. Kelishini avtomatik kutamiz — kelgach yangi tab o&apos;zi yopiladi.</li>
        </ol>
      </div>

      {mailboxEmail && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2">
          <code className="flex-1 truncate text-xs font-mono">{mailboxEmail}</code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={copyEmail}
          >
            {copied ? '✓ Nusxa olindi' : 'Nusxa'}
          </Button>
        </div>
      )}

      <Button type="button" className="w-full" onClick={openKonami}>
        Konami forgot-password sahifasini ochish
      </Button>

      <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        Xat kelgach state avtomatik yangilanadi. Yoki qo&apos;lda tekshirish uchun:
      </div>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={recheck}
        disabled={submitting}
      >
        <RefreshCw className={cn('mr-2 h-3.5 w-3.5', submitting && 'animate-spin')} />
        {submitting ? 'Tekshirilmoqda…' : 'Qayta tekshir'}
      </Button>
    </div>
  );
}

function WaitingPasswordSellerPanel({
  trade,
  onActionError,
  onRefresh,
}: {
  trade: TradeResponse;
  onActionError: (msg: string | null) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      <Button
        type="button"
        className="w-full"
        onClick={() => setShowModal(true)}
      >
        Konami parolini yuborish
      </Button>
      {showModal && (
        <SendPasswordModal
          trade={trade}
          onClose={() => setShowModal(false)}
          onSent={async () => {
            setShowModal(false);
            onActionError(null);
            await onRefresh();
          }}
          onError={onActionError}
        />
      )}
    </>
  );
}

function WaitingBuyerVerifyBuyerPanel({
  trade,
  revealedPassword,
  onRevealed,
  onActionError,
  onRefresh,
}: {
  trade: TradeResponse;
  revealedPassword: string | null;
  onRevealed: (pw: string) => void;
  onActionError: (msg: string | null) => void;
  onRefresh: () => Promise<void> | void;
}) {
  const [showRevealModal, setShowRevealModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [revealing, startReveal] = useTransition();
  const [confirming, startConfirm] = useTransition();
  const [rejecting, startReject] = useTransition();
  const [copied, setCopied] = useState(false);
  const [emailCopied, setEmailCopied] = useState(false);
  const mailboxEmail = trade.mailboxEmail ?? '';

  function reveal() {
    if (!trade.passwordMessageId) {
      onActionError('Parol xabari topilmadi — sahifani yangilang.');
      return;
    }
    onActionError(null);
    startReveal(async () => {
      const r = await postReveal(trade.id, trade.passwordMessageId!);
      if (!r.ok) {
        onActionError(r.error);
        setShowRevealModal(false);
        return;
      }
      onRevealed(r.data.password);
      setShowRevealModal(false);
    });
  }

  async function copyEmail() {
    if (!mailboxEmail) return;
    try {
      await navigator.clipboard.writeText(mailboxEmail);
      setEmailCopied(true);
      window.setTimeout(() => setEmailCopied(false), 1500);
    } catch {
      // Silent — user can select manually.
    }
  }

  function confirmTrade() {
    onActionError(null);
    startConfirm(async () => {
      const r = await postTradeAction(trade.id, 'confirm');
      if (!r.ok) {
        onActionError(r.error);
        return;
      }
      setShowConfirmModal(false);
      await onRefresh();
    });
  }

  function rejectTrade() {
    onActionError(null);
    startReject(async () => {
      const r = await postTradeAction(trade.id, 'reject');
      if (!r.ok) {
        onActionError(r.error);
        return;
      }
      setShowRejectModal(false);
      await onRefresh();
    });
  }

  async function copyPw() {
    if (!revealedPassword) return;
    try {
      await navigator.clipboard.writeText(revealedPassword);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Silent — user can select manually.
    }
  }

  return (
    <div className="space-y-2">
      {revealedPassword ? (
        <>
          <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
            {mailboxEmail && (
              <div>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                  Konami email
                </p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded bg-white/80 px-2 py-1 font-mono text-sm text-foreground">
                    {mailboxEmail}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={copyEmail}
                    aria-label="Emailni nusxa olish"
                  >
                    <Copy className="mr-1 h-3.5 w-3.5" />
                    {emailCopied ? 'Nusxalandi' : 'Nusxa'}
                  </Button>
                </div>
              </div>
            )}
            <div>
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-primary">
                Konami paroli
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-white/80 px-2 py-1 font-mono text-sm text-foreground">
                  {revealedPassword}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={copyPw}
                  aria-label="Nusxa olish"
                >
                  <Copy className="mr-1 h-3.5 w-3.5" />
                  {copied ? 'Nusxalandi' : 'Nusxa'}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Yuqoridagi email + parol bilan Konami akkauntga kira olganingizni
              tekshiring. Parol qayta ochilmaydi.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="flex-1"
              onClick={() => setShowConfirmModal(true)}
              disabled={confirming || rejecting}
            >
              Tasdiqlash
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setShowRejectModal(true)}
              disabled={confirming || rejecting}
            >
              Rad etish
            </Button>
          </div>
        </>
      ) : (
        <Button
          type="button"
          className="w-full"
          onClick={() => setShowRevealModal(true)}
          disabled={revealing || !trade.passwordMessageId}
        >
          Parolni ko&apos;rsatish
        </Button>
      )}

      {showRevealModal && (
        <ConfirmModal
          title="Parolni ochish"
          body={
            <p>
              Parol faqat <b>bir marta</b> ochiladi. Ochilgach uni ko&apos;chirib
              olishga tayyormisiz?
            </p>
          }
          confirmLabel={revealing ? 'Ochilmoqda…' : "Ha, ochaman"}
          submitting={revealing}
          onConfirm={reveal}
          onClose={() => setShowRevealModal(false)}
        />
      )}
      {showConfirmModal && (
        <ConfirmModal
          title="Savdoni tasdiqlash"
          body={
            <p>
              Sotuvchining Konami akkauntiga muvaffaqiyatli kirdingizmi?
              Tasdiqlagach savdo yakunlanadi.
            </p>
          }
          confirmLabel={confirming ? 'Tasdiqlanmoqda…' : 'Ha, tasdiqlayman'}
          submitting={confirming}
          onConfirm={confirmTrade}
          onClose={() => setShowConfirmModal(false)}
        />
      )}
      {showRejectModal && (
        <ConfirmModal
          title="Savdoni rad etish"
          body={
            <p>
              Rad etilsa savdo yopiladi va sotuvchi bilan qayta bog&apos;lanish
              kerak bo&apos;ladi. Davom etasizmi?
            </p>
          }
          confirmLabel={rejecting ? 'Rad etilmoqda…' : 'Ha, rad etaman'}
          submitting={rejecting}
          destructive
          onConfirm={rejectTrade}
          onClose={() => setShowRejectModal(false)}
        />
      )}
    </div>
  );
}

function SuccessPanel({ trade }: { trade: TradeResponse }) {
  return (
    <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-3 text-xs text-emerald-900 dark:border-emerald-400/30 dark:bg-emerald-400/10 dark:text-emerald-100">
      <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <CheckCircle2 className="h-4 w-4" />
        Savdo muvaffaqiyatli yakunlandi
      </div>
      <p>
        {formatPriceUZS(trade.priceUzs)} to&apos;landi va Konami akkaunti
        o&apos;tkazildi. Tabriklaymiz!
      </p>
    </div>
  );
}

function TerminalBanner({
  tone,
  icon,
  children,
}: {
  tone: 'destructive' | 'muted';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls =
    tone === 'destructive'
      ? 'border-destructive/40 bg-destructive/10 text-destructive'
      : 'border-border bg-muted/40 text-muted-foreground';
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg border px-3 py-2 text-xs',
        cls,
      )}
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {children}
    </p>
  );
}

// -------------------- confirm/send-password modals --------------------

function ConfirmModal({
  title,
  body,
  confirmLabel,
  submitting,
  destructive,
  onConfirm,
  onClose,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  submitting: boolean;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ModalShell title={title} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-foreground">
          {body}
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button
            type="button"
            className={cn(
              destructive &&
                'bg-destructive text-destructive-foreground hover:bg-destructive/90',
            )}
            onClick={onConfirm}
            disabled={submitting}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function SendPasswordModal({
  trade,
  onClose,
  onSent,
  onError,
}: {
  trade: TradeResponse;
  onClose: () => void;
  onSent: () => Promise<void> | void;
  onError: (msg: string) => void;
}) {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = password.trim();
    if (trimmed.length < 4) {
      setLocalError("Parol kamida 4 belgidan iborat bo'lishi kerak");
      return;
    }
    setLocalError(null);
    startSubmit(async () => {
      const r = await postSendPassword(trade.id, trimmed);
      if (!r.ok) {
        setLocalError(null);
        onError(r.error);
        return;
      }
      await onSent();
    });
  }

  return (
    <ModalShell title="Konami parolini yuborish" onClose={onClose}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
          Konami saytida yangi parolni o&apos;rnatgach uni bu yerga kiriting.
          Xaridor faqat bir marta ochib ko&apos;ra oladi.
        </div>
        <div>
          <Label htmlFor="konami-password">Parol</Label>
          <div className="flex items-center gap-2">
            <Input
              id="konami-password"
              type={showPw ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Konami paroli"
              autoComplete="off"
              minLength={4}
              maxLength={200}
              required
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setShowPw((v) => !v)}
            >
              {showPw ? 'Yashirish' : "Ko'rsatish"}
            </Button>
          </div>
        </div>
        {localError && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{localError}</span>
          </div>
        )}
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={submitting}
          >
            Bekor qilish
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Yuborilmoqda…' : 'Yuborish'}
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}

// -------------------- pending proposal --------------------

interface PendingProposal {
  id: string;
  priceUzs: number;
  expiresAt: string;
  mode?: TradeMode;
  adminId?: string;
  adminFeeUzs?: number;
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
        <p className="rounded-lg bg-white/60 px-3 py-2 text-xs text-muted-foreground dark:bg-white/5">
          Xaridor javobini kutmoqda.
          {isHumanProposal(proposal) && proposal.adminFeeUzs
            ? ` Inson admin narxi: ${formatPriceUZS(proposal.adminFeeUzs)}.`
            : ''}
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
  accountRequest,
  onClose,
  onCreated,
}: {
  chat: ChatResponse;
  viewerId: string;
  listing: ListingResponse | null;
  otherPartyId: string;
  /** Decides which account is sold and who buys it; null only on legacy chats. */
  accountRequest: AccountRequest | null;
  onClose: () => void;
  onCreated: (p: ProposalResponse, priceUzs: number, mode: TradeMode, adminFeeUzs?: number) => void;
}) {
  const initialPrice = listing ? String(Math.trunc(Number(listing.price))) : '';
  const [mode, setMode] = useState<TradeMode>('SMART');
  const [price, setPrice] = useState(initialPrice);
  const [selectedAdmin, setSelectedAdmin] = useState<TradeAdminCardResponse | null>(null);
  const [adminFee, setAdminFee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (selectedAdmin && !adminFee) setAdminFee(String(selectedAdmin.minFeeUzs));
  }, [selectedAdmin, adminFee]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const priceUzs = Number(price);
    if (!Number.isFinite(priceUzs) || priceUzs <= 0) {
      setError("Narx musbat butun son bo'lishi kerak");
      return;
    }
    const feeUzs = Number(adminFee);
    if (mode === 'HUMAN') {
      const feeValidation = validateAdminFee(selectedAdmin, feeUzs);
      if (!feeValidation.ok) {
        setError(feeValidation.error);
        return;
      }
    }
    // The account request is the authority on both halves: which listing is
    // being sold, and who is buying it. `listing` here is only the page the
    // chat was opened from, which need not be the account under negotiation.
    const payload: ProposalCreateRequest = {
      marketplaceChatId: chat.id,
      otherPartyUserId: accountRequest?.requesterId ?? otherPartyId,
      sellerId: viewerId,
      buyerId: accountRequest?.requesterId ?? otherPartyId,
      amountUzs: priceUzs,
      mode,
      listingId: accountRequest?.listingId ?? listing?.id ?? null,
    };
    if (mode === 'HUMAN' && selectedAdmin) {
      payload.adminId = selectedAdmin.userId;
      payload.adminFeeUzs = feeUzs;
    }
    startSubmit(async () => {
      const result = await postProposal(payload);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onCreated(result.data, priceUzs, mode, mode === 'HUMAN' ? feeUzs : undefined);
    });
  }

  return (
    <ModalShell title="Taklif yuborish" onClose={onClose}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        {/* The whole chooser disappears when human admin is closed: SMART is
            then the only mode, and a radio group with one option is noise.
            setMode is never called, so `mode` stays at its 'SMART' default and
            every branch below already handles that. */}
        {FEATURES.humanAdmin && (
        <div>
          <Label>Admin turi</Label>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Admin turi">
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'SMART'}
              onClick={() => setMode('SMART')}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition',
                mode === 'SMART'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40',
              )}
            >
              <span className="block font-black">Smart admin</span>
              <span className="text-[10.5px]">Avtomatik escrow flow</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={mode === 'HUMAN'}
              onClick={() => setMode('HUMAN')}
              className={cn(
                'rounded-lg border px-3 py-2 text-left text-sm transition',
                mode === 'HUMAN'
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40',
              )}
            >
              <span className="flex items-center gap-1.5 font-black">
                <UserCog className="h-4 w-4" />
                Inson admin
              </span>
              <span className="text-[10.5px]">Platforma bepul</span>
            </button>
          </div>
        </div>
        )}

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
          {Number(price) > 0 && (
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Xaridor <b className="text-foreground">{formatPriceUZS(Number(price))}</b> to&apos;laydi ·
              smart-admin xizmati <b className="text-foreground">−{formatPriceUZS(tradeFeeSom(Number(price)))}</b> ·
              sotuvchiga <b className="text-foreground">{formatPriceUZS(sellerProceedsSom(Number(price)))}</b>
            </p>
          )}
        </div>
        {mode === 'SMART' ? (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            To&apos;lov xaridorning hamyonidan yechiladi va savdo yakunlangunicha
            platformada saqlanadi. Karta kerak emas.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
              Inson admin savdosida xaridor admin bilan bevosita to'lov qiladi.
              Platforma pulni ushlab turmaydi va komissiya olmaydi.
            </div>
            <div>
              <Label>Admin tanlash</Label>
              <TradeAdminPicker
                value={selectedAdmin?.userId}
                onSelect={(admin) => {
                  setSelectedAdmin(admin);
                  setAdminFee(String(admin.minFeeUzs));
                }}
              />
            </div>
            <div>
              <Label htmlFor="human-admin-fee">Admin xizmati narxi (UZS)</Label>
              <Input
                id="human-admin-fee"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={adminFee}
                onChange={(e) => setAdminFee(e.target.value)}
                placeholder={selectedAdmin ? String(selectedAdmin.minFeeUzs) : '30000'}
                required
              />
              {selectedAdmin && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Ruxsat etilgan oraliq: {formatPriceUZS(selectedAdmin.minFeeUzs)} -{' '}
                  {formatPriceUZS(selectedAdmin.maxFeeUzs)}
                </p>
              )}
            </div>
          </div>
        )}
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
          <Button type="submit" disabled={submitting}>
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // No card: a smart trade is paid from the buyer's wallet balance, which
    // is frozen the moment this accept succeeds.
    const payload: ProposalAcceptRequest = {};
    startSubmit(async () => {
      const result = await postProposalAccept(proposal.id, payload);
      if (!result.ok) {
        if (isInsufficientFunds(result.error)) {
          await sendToTopUp(proposal.priceUzs, setError);
          return;
        }
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
          {isHumanProposal(proposal) ? (
            <p className="mt-0.5">
              Tasdiqlagach inson admin taklifni qabul qiladi. Admin to'lovi
              platformadan tashqarida, bevosita admin bilan qilinadi.
            </p>
          ) : (
            <p className="mt-0.5">Tasdiqlagach savdo boshlanadi.</p>
          )}
        </div>
        {!isHumanProposal(proposal) && (
          <div className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {formatPriceUZS(proposal.priceUzs)}
            </span>{' '}
            hamyoningizdan yechilib, savdo yakunlanguncha platformada saqlanadi.
            Savdo bekor bo&apos;lsa to&apos;liq qaytariladi.
          </div>
        )}
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
          <Button type="submit" disabled={submitting}>
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
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-card-hover">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-foreground">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 p-0"
            onClick={onClose}
            aria-label="Yopish"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/**
 * Turns "you cannot afford this" into an invoice for exactly the difference.
 *
 * The buyer is not asked to work out what they are short, open the wallet and
 * type it in: the invoice is created here, for the shortfall alone, and the
 * wallet page renders its panel with the card to pay. "Payment pending" then
 * means what it says.
 *
 * Navigates either way. If the invoice could not be created — a live one
 * already occupies the slot is the usual reason — the amount rides along in the
 * URL so the wallet still opens with the right number in the box.
 */
async function sendToTopUp(priceUzs: number, onError: (msg: string) => void) {
  const wallet = await fetchWalletBalance();
  if (wallet === null) {
    onError('Hamyon holatini o‘qib bo‘lmadi — hamyon bo‘limidan to‘ldiring');
    return;
  }
  const missing = shortfallSom(priceUzs, wallet.availableTiyin);
  if (missing <= 0) {
    // The balance covers it after all: something else refused the accept, and
    // sending the buyer to top up money they already have would be nonsense.
    onError('Hamyonda mablag‘ bor — qaytadan urinib ko‘ring');
    return;
  }
  try {
    await createInvoice(missing);
  } catch {
    // Fall through: the wallet page shows whatever invoice is already live,
    // and topUpHref carries the amount if there is none.
  }
  window.location.href = topUpHref(missing);
}

async function fetchWalletBalance(): Promise<{ availableTiyin: number } | null> {
  try {
    const response = await fetch('/api/payment/v1/payments/wallet', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    return (await response.json()) as { availableTiyin: number };
  } catch {
    return null;
  }
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

async function fetchPendingProposal(
  chatId: string,
): Promise<PendingProposalResponse | null> {
  const response = await fetch(
    `/api/trade/v1/trades/proposals?chatId=${encodeURIComponent(chatId)}`,
    { credentials: 'include', headers: { Accept: 'application/json' } },
  );
  if (response.status === 204 || response.status === 404) return null;
  if (!response.ok) return null;
  try {
    return (await response.json()) as PendingProposalResponse;
  } catch {
    return null;
  }
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

/**
 * Fires a state-transition action. `path` is one of the segments under
 * `/trades/{id}/actions/…` (payment-confirmed, email-changed, recheck,
 * confirm, reject). Response body is the updated TradeResponse but the
 * caller usually just reloads the list.
 */
async function postTradeAction(
  tradeId: string,
  path: 'payment-confirmed' | 'email-changed' | 'recheck' | 'confirm' | 'reject',
): Promise<MutationResult<TradeResponse>> {
  const response = await fetch(
    `/api/trade/v1/trades/${encodeURIComponent(tradeId)}/actions/${path}`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return { ok: true, data: (await response.json()) as TradeResponse };
}

async function postSendPassword(
  tradeId: string,
  password: string,
): Promise<MutationResult<{ messageId: string }>> {
  const response = await fetch(
    `/api/trade/v1/trades/${encodeURIComponent(tradeId)}/messages/password`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ password }),
    },
  );
  if (!response.ok) return { ok: false, error: await readErrorMessage(response) };
  return {
    ok: true,
    data: (await response.json()) as { messageId: string },
  };
}

async function postReveal(
  tradeId: string,
  messageId: string,
): Promise<MutationResult<{ password: string }>> {
  const response = await fetch(
    `/api/trade/v1/trades/${encodeURIComponent(tradeId)}/messages/${encodeURIComponent(messageId)}/reveal`,
    {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok) {
    // 410 Gone means the one-shot Redis key has already been consumed.
    if (response.status === 410) {
      return { ok: false, error: 'Parol allaqachon ochilgan yoki muddati tugagan' };
    }
    return { ok: false, error: await readErrorMessage(response) };
  }
  return {
    ok: true,
    data: (await response.json()) as { password: string },
  };
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
