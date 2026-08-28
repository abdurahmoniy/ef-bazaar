'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  Coins,
  Copy,
  Handshake,
  History,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  UserCog,
  Users,
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
import { SellerRatingForm } from '@/components/chat/seller-rating-form';
import { TipCallout } from '@/components/help/tip-callout';
import { DivisionBadge, toDivisionLevel } from '@/components/marketplace/division-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { listingMediaUrl, listingMediaUrls } from '@/lib/marketplace-media';
import type { ChatResponse, ListingResponse } from '@/lib/marketplace-types';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import { isHumanProposal, isHumanTrade, validateAdminFee } from '@/lib/trade-human';
import { createInvoice } from '@/lib/payment-client';
import {
  allowedKinds,
  counterpartStatus,
  isSwap,
  hasClearedCurrentStep,
  isWaitingForCounterpart,
  needsAmount,
  TRADE_KIND_HINT_UZ,
  TRADE_KIND_LABEL_UZ,
  type ExchangeMode,
} from '@/lib/trade-swap';
import {
  isInsufficientFunds,
  proposerShortfallSom,
  shortfallSom,
  topUpHref,
} from '@/lib/wallet-shortfall';
import {
  isTerminalState,
  splitTrades,
  TRADE_STATE_LABEL_UZ,
  type PendingProposalResponse,
  type ProposalAcceptRequest,
  type ProposalCreateRequest,
  type ProposalResponse,
  type TradeAdminCardResponse,
  type ParticipantRole,
  type TradeKind,
  type TradeMode,
  type TradeResponse,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';
import { FEATURES } from '@/lib/feature-flags';
import { sellerProceedsSom, tradeFeeSom } from '@/lib/trade-commission';
import { useTradeContext, type PendingProposal } from './trade-context';

export interface TradePanelProps {
  chat?: ChatResponse;
  viewerId?: string;
  listing?: ListingResponse | null;
  initialPendingProposal?: PendingProposalResponse | null;
}

/**
 * Full-lifecycle trade driver rendered in the chat stream, synchronized with the pinned bar.
 */
export function TradePanel(_props?: TradePanelProps) {
  const { isDrawerOpen } = useTradeContext();

  return (
    <>
      <div id="chat-trade-panel" className="scroll-mt-24 transition-all duration-300">
        <TradePanelContent />
      </div>
      {isDrawerOpen && <TradeDrawerModal />}
    </>
  );
}

function TradeDrawerModal() {
  const { isDrawerOpen, setIsDrawerOpen, scrollToTradePanel } = useTradeContext();

  if (!isDrawerOpen) return null;

  return (
    <ModalShell title="Savdo boshqaruvi" onClose={() => setIsDrawerOpen(false)}>
      <div className="space-y-3">
        <TradePanelContent isInsideDrawer />
        <div className="flex items-center justify-between border-t border-border pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setIsDrawerOpen(false);
              scrollToTradePanel();
            }}
            className="text-xs text-primary hover:text-primary"
          >
            Chatdagi joyiga o‘tish
            <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setIsDrawerOpen(false)}
          >
            Yopish
          </Button>
        </div>
      </div>
    </ModalShell>
  );
}

function TradePanelContent({ isInsideDrawer = false }: { isInsideDrawer?: boolean }) {
  const {
    chat,
    viewerId,
    listing,
    otherPartyId,
    accountRequest,
    setAccountRequest,
    role,
    isSeller,
    trades,
    activeTrade,
    lastFinished,
    proposal,
    setProposal,
    startingNew,
    setStartingNew,
    refreshing,
    reload,
    handleProposalCreated,
    handleProposalAccepted,
    showPicker,
    setShowPicker,
    showProposeModal,
    setShowProposeModal,
    showAcceptModal,
    setShowAcceptModal,
  } = useTradeContext();

  // Nothing to render while the first fetch is in flight
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

  // ---- a trade that has ended, still on screen until they move past it ----
  if (lastFinished && !startingNew && !proposal) {
    return (
      <div className="space-y-2">
        <ActiveTradeCard
          trade={lastFinished}
          viewerId={viewerId}
          onRefresh={reload}
          refreshing={refreshing}
        />
        <Button
          type="button"
          variant="outline"
          className="mx-auto block w-full max-w-md"
          onClick={() => setStartingNew(true)}
        >
          Yangi savdo boshlash
        </Button>
      </div>
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
    <div
      className={cn(
        'mx-auto max-w-md rounded-2xl border border-border bg-card px-4 py-3 shadow-card',
        isInsideDrawer && 'border-none p-0 shadow-none',
      )}
    >
      {lastFinished && <LastTradeLine trade={lastFinished} />}
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

      {!isInsideDrawer && (
        <TipCallout
          variant="security"
          learnMoreHref="/help#100-percent-secure-trade-guarantee"
          learnMoreLabel="Kafolat shartlari"
          className="mb-3"
        >
          <strong>100% Kafolatlangan va Xavfsiz Bitim:</strong> Mablag‘ to‘liq platforma depozitida muzlatiladi. Akkount topshirilmaguncha pul berilmaydi, to‘lov qilinmaguncha akkount o‘tmaydi.
        </TipCallout>
      )}

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

/**
 * How the previous trade ended, above the controls for starting another.
 */
function LastTradeLine({ trade }: { trade: TradeResponse }) {
  const ended =
    trade.state === 'SUCCESS'
      ? { text: 'Oxirgi savdo muvaffaqiyatli yakunlandi', tone: 'text-emerald-700 dark:text-emerald-400' }
      : trade.state === 'REJECTED'
        ? { text: 'Oxirgi savdo rad etildi', tone: 'text-destructive' }
        : { text: 'Oxirgi savdo muddati tugadi', tone: 'text-muted-foreground' };
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted/40 px-3 py-2 text-[11.5px]">
      <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className={ended.tone}>
        {ended.text}. Quyidan yangisini boshlashingiz mumkin.
      </span>
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
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

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
          {trade.stateDeadline && !isTerminalState(trade.state) && (
            <span className="text-[10px] text-muted-foreground">
              <CountdownText until={trade.stateDeadline} prefix="Qoldi:" />
            </span>
          )}
        </div>
      </div>

      <CounterpartLine trade={trade} viewerRole={trade.role ?? null} />

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
  const acts = isSeller || isSwap(trade.kind);
  if (hasClearedCurrentStep(trade, trade.role ?? null)) {
    return <WaitingForCounterpartPanel trade={trade} />;
  }
  switch (trade.state) {
    case 'INITIATED':
      return <InitiatedPanel />;
    case 'WAITING_PAYMENT':
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
      return acts ? (
        <WaitingEmailChangeSellerPanel
          trade={trade}
          onActionError={onActionError}
          onRefresh={onRefresh}
        />
      ) : (
        <InfoBox>Sotuvchi email o&apos;zgartirishini kutmoqda.</InfoBox>
      );
    case 'VERIFYING_KONAMI_LINK':
      return acts ? (
        <VerifyingKonamiSellerPanel
          trade={trade}
          onActionError={onActionError}
          onRefresh={onRefresh}
        />
      ) : (
        <InfoBox>Konami tekshirilmoqda…</InfoBox>
      );
    case 'WAITING_PASSWORD':
      return acts ? (
        <WaitingPasswordSellerPanel
          trade={trade}
          onActionError={onActionError}
          onRefresh={onRefresh}
        />
      ) : (
        <InfoBox>Sotuvchi Konami parolini yuborishini kutmoqda.</InfoBox>
      );
    case 'WAITING_BUYER_VERIFY':
      return isBuyer || isSwap(trade.kind) ? (
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
      return <SuccessPanel trade={trade} isBuyer={isBuyer} />;
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

function WaitingForCounterpartPanel({ trade }: { trade: TradeResponse }) {
  return (
    <div className="space-y-2">
      <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="font-semibold text-foreground">Sizning qismingiz bajarildi</p>
          <p className="mt-0.5 text-muted-foreground">
            {counterpartStatus(trade, trade.role ?? null)
              ?? 'Ikkinchi taraf o‘z qismini bajarishini kutmoqda'}
            . Ikkala taraf ham tugatgach savdo keyingi bosqichga o‘tadi.
          </p>
        </div>
      </div>
    </div>
  );
}

function CounterpartLine({
  trade,
  viewerRole,
}: {
  trade: TradeResponse;
  viewerRole: ParticipantRole | null;
}) {
  const status = counterpartStatus(trade, viewerRole);
  if (!status) return null;
  const waiting = isWaitingForCounterpart(trade, viewerRole);
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-lg px-3 py-2 text-[11.5px]',
        waiting ? 'bg-primary/5 text-foreground' : 'bg-muted/40 text-muted-foreground',
      )}
    >
      <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        {status}
        {waiting && (
          <b className="ml-1 text-primary">— sizning qismingiz bajarildi</b>
        )}
      </span>
    </div>
  );
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
      // silent
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
          Bu kodni Konami sahifasidagi email o&apos;zgartirish oynasiga kiriting.
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
  const konamiHref = mailboxEmail
    ? `${KONAMI_FORGOT_URL}?email=${encodeURIComponent(mailboxEmail)}`
    : KONAMI_FORGOT_URL;

  useEffect(() => {
    return () => {
      if (konamiTabRef.current && !konamiTabRef.current.closed) {
        try {
          konamiTabRef.current.close();
        } catch {
          // silent
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
      // silent
    }
  }

  function openKonami(ev: React.MouseEvent<HTMLButtonElement>) {
    ev.preventDefault();
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
      // silent
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
      // silent
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

function SuccessPanel({
  trade,
  isBuyer,
}: {
  trade: TradeResponse;
  isBuyer: boolean;
}) {
  return (
    <div className="space-y-3">
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

      {isBuyer && (
        <SellerRatingForm
          tradeId={trade.id}
          isBuyer={isBuyer}
        />
      )}
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
            {isSwap(proposal.kind) ? 'Almashish taklifi' : 'Taklif yuborildi'}
          </p>
          <p className="text-sm font-semibold text-foreground">
            {isSwap(proposal.kind) ? (
              <>
                <span>{TRADE_KIND_LABEL_UZ[proposal.kind ?? 'SWAP']}</span>
                {proposal.priceUzs > 0 && (
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    · {formatPriceUZS(proposal.priceUzs)}
                  </span>
                )}
              </>
            ) : (
              formatPriceUZS(proposal.priceUzs)
            )}
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
  accountRequest: AccountRequest | null;
  onClose: () => void;
  onCreated: (p: ProposalResponse, priceUzs: number, mode: TradeMode, adminFeeUzs?: number, kind?: TradeKind) => void;
}) {
  const effectiveListing = accountRequest?.listing ?? listing;
  const originalPrice = effectiveListing ? Number(effectiveListing.price) : 0;
  const initialPrice = originalPrice > 0 ? String(Math.trunc(originalPrice)) : '';
  const coverUrl =
    accountRequest?.listing?.coverMessageId
      ? listingMediaUrl(accountRequest.listing.coverMessageId)
      : listing
        ? listingMediaUrls(listing, 1)[0]
        : null;
  const divLevel =
    listing?.attributes?.highest_division_level
      ? toDivisionLevel(listing.attributes.highest_division_level)
      : undefined;

  const listingExchangeMode = listing?.attributes?.exchange_mode as ExchangeMode | undefined;
  const availableKinds = useMemo(() => allowedKinds(listingExchangeMode), [listingExchangeMode]);
  const [kind, setKind] = useState<TradeKind>(
    availableKinds.includes('SALE') ? 'SALE' : (availableKinds[0] ?? 'SWAP'),
  );
  const [mode, setMode] = useState<TradeMode>('SMART');
  const [price, setPrice] = useState(initialPrice);
  const [surcharge, setSurcharge] = useState('');
  const [selectedAdmin, setSelectedAdmin] = useState<TradeAdminCardResponse | null>(null);
  const [adminFee, setAdminFee] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();

  useEffect(() => {
    if (selectedAdmin && !adminFee) setAdminFee(String(selectedAdmin.minFeeUzs));
  }, [selectedAdmin, adminFee]);

  const effectiveAmountUzs =
    kind === 'SALE'
      ? Number(price)
      : kind === 'SWAP_SURCHARGE'
        ? Number(surcharge)
        : 0;

  const priceNum = Number(price);
  const hasValidPrice = Number.isFinite(priceNum) && priceNum > 0;
  const feeNum = hasValidPrice ? tradeFeeSom(priceNum) : 0;
  const proceedsNum = hasValidPrice ? sellerProceedsSom(priceNum) : 0;

  const presets = useMemo(() => {
    if (!originalPrice || originalPrice <= 0) return [];
    const p5 = Math.round((originalPrice * 0.95) / 1000) * 1000;
    const p10 = Math.round((originalPrice * 0.9) / 1000) * 1000;
    const p20k = originalPrice - 20000;
    const list: Array<{ label: string; value: number }> = [
      { label: 'Asl narx', value: originalPrice },
      { label: '−5%', value: p5 },
      { label: '−10%', value: p10 },
    ];
    if (p20k > 0 && p20k !== p5 && p20k !== p10) {
      list.push({ label: '−20 ming', value: p20k });
    }
    return list.filter(
      (p, idx, arr) =>
        p.value > 0 &&
        arr.findIndex((other) => other.value === p.value) === idx,
    );
  }, [originalPrice]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (needsAmount(kind)) {
      if (!Number.isFinite(effectiveAmountUzs) || effectiveAmountUzs <= 0) {
        setError("Miqdor musbat butun son bo'lishi kerak");
        return;
      }
    }
    const feeUzs = Number(adminFee);
    if (mode === 'HUMAN') {
      const feeValidation = validateAdminFee(selectedAdmin, feeUzs);
      if (!feeValidation.ok) {
        setError(feeValidation.error);
        return;
      }
    }
    const payload: ProposalCreateRequest = {
      marketplaceChatId: chat.id,
      otherPartyUserId: accountRequest?.requesterId ?? otherPartyId,
      sellerId: viewerId,
      buyerId: accountRequest?.requesterId ?? otherPartyId,
      amountUzs: effectiveAmountUzs,
      mode,
      kind,
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
      onCreated(result.data, effectiveAmountUzs, mode, mode === 'HUMAN' ? feeUzs : undefined, kind);
    });
  }

  return (
    <ModalShell title="Taklif yuborish" onClose={onClose}>
      <form className="space-y-3" onSubmit={handleSubmit}>
        {/* Context Preview Card */}
        {effectiveListing && (
          <div className="flex items-center gap-2.5 rounded-xl border border-border bg-muted/40 p-2 sm:p-2.5 text-xs min-w-0">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt="Akkount"
                className="h-10 w-10 sm:h-11 sm:w-11 shrink-0 rounded-lg object-cover border border-border/50"
              />
            ) : (
              <div className="grid h-10 w-10 sm:h-11 sm:w-11 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground border border-border/50">
                <Smartphone className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0">
                {divLevel && (
                  <DivisionBadge level={divLevel} size={15} className="shrink-0" />
                )}
                <p className="truncate font-bold text-foreground text-xs">
                  {effectiveListing.description.slice(0, 50) || "Akkount"}
                </p>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
                Asl narxi: <span className="font-semibold text-foreground">{formatPriceUZS(originalPrice)}</span>
              </p>
            </div>
          </div>
        )}

        {/* Kind Selector */}
        {availableKinds.length > 1 && (
          <div>
            <Label className="text-xs font-bold">Savdo turi</Label>
            <div className="mt-1 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Savdo turi">
              {availableKinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => {
                    setKind(k);
                    telegramHaptic(getTelegramWebApp(), 'selection', false);
                  }}
                  className={cn(
                    'rounded-xl border py-2 px-1 text-center text-xs font-bold transition select-none truncate',
                    kind === k
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30 font-black'
                      : 'border-border bg-card text-muted-foreground hover:border-primary/40',
                  )}
                >
                  {TRADE_KIND_LABEL_UZ[k]}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {TRADE_KIND_HINT_UZ[kind]}
            </p>
          </div>
        )}

        {/* Admin Mode Selector */}
        {FEATURES.humanAdmin && (
          <div>
            <Label className="text-xs font-bold">Admin turi</Label>
            <div className="mt-1 grid grid-cols-2 gap-2" role="radiogroup" aria-label="Admin turi">
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'SMART'}
                onClick={() => {
                  setMode('SMART');
                  telegramHaptic(getTelegramWebApp(), 'selection', false);
                }}
                className={cn(
                  'rounded-xl border p-2.5 text-left text-xs transition select-none min-w-0',
                  mode === 'SMART'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40',
                )}
              >
                <span className="block font-black text-foreground truncate">Smart admin</span>
                <span className="text-[10.5px] text-muted-foreground truncate block">Avtomatik escrow flow</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={mode === 'HUMAN'}
                onClick={() => {
                  setMode('HUMAN');
                  telegramHaptic(getTelegramWebApp(), 'selection', false);
                }}
                className={cn(
                  'rounded-xl border p-2.5 text-left text-xs transition select-none min-w-0',
                  mode === 'HUMAN'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary/30'
                    : 'border-border bg-card text-muted-foreground hover:border-primary/40',
                )}
              >
                <span className="flex items-center gap-1.5 font-black text-foreground truncate">
                  <UserCog className="h-3.5 w-3.5 shrink-0" />
                  Inson admin
                </span>
                <span className="text-[10.5px] text-muted-foreground truncate block">Platforma bepul</span>
              </button>
            </div>
          </div>
        )}

        {/* Sale Price Input & Presets */}
        {kind === 'SALE' && (
          <div className="space-y-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="trade-price" className="text-xs font-bold shrink-0">
                  Taklif narxi (so'm)
                </Label>
                {hasValidPrice && (
                  <span className="text-[11px] font-black text-primary truncate">
                    {formatPriceUZS(priceNum)}
                  </span>
                )}
              </div>
              <div className="relative">
                <Coins className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
                <Input
                  id="trade-price"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder="500000"
                  className="h-10 rounded-xl pl-9 pr-3 text-xs font-bold"
                  required
                />
              </div>
            </div>

            {/* Quick Discount Presets: Responsive 2-column or 4-column Grid */}
            {presets.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {presets.map((preset) => {
                  const isSelected = Number(price) === preset.value;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setPrice(String(preset.value));
                        telegramHaptic(getTelegramWebApp(), 'selection', false);
                      }}
                      className={cn(
                        'tap-press flex flex-col items-center justify-center rounded-xl border py-1.5 px-1 text-center transition select-none min-w-0',
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30 font-black'
                          : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
                      )}
                    >
                      <span className="text-[10px] font-semibold opacity-75">{preset.label}</span>
                      <span className="text-[11px] font-bold truncate max-w-full">{formatPriceUZS(preset.value)}</span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Financial Breakdown Card */}
            {hasValidPrice && (
              <div className="rounded-xl border border-border bg-muted/20 p-2.5 sm:p-3 space-y-1.5 text-xs min-w-0">
                <div className="flex items-center justify-between gap-2 text-muted-foreground text-[11.5px]">
                  <span className="shrink-0">Xaridor to‘laydi:</span>
                  <span className="font-bold text-foreground truncate">{formatPriceUZS(priceNum)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-muted-foreground text-[11.5px]">
                  <span className="shrink-0">Smart-admin xizmati:</span>
                  <span className="font-semibold text-destructive truncate">
                    −{formatPriceUZS(feeNum)}
                  </span>
                </div>
                <div className="border-t border-border/60 pt-1.5 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300 text-xs shrink-0">
                    <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    Sotuvchiga sof:
                  </span>
                  <span className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-300 truncate">
                    {formatPriceUZS(proceedsNum)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Swap Surcharge Input */}
        {kind === 'SWAP_SURCHARGE' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="swap-surcharge" className="text-xs font-bold shrink-0">
                Doplata miqdori (so'm)
              </Label>
              {Number(surcharge) > 0 && (
                <span className="text-[11px] font-black text-primary truncate">
                  {formatPriceUZS(Number(surcharge))}
                </span>
              )}
            </div>
            <div className="relative">
              <Coins className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-500" />
              <Input
                id="swap-surcharge"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={surcharge}
                onChange={(e) => setSurcharge(e.target.value)}
                placeholder="100000"
                className="h-10 rounded-xl pl-9 pr-3 text-xs font-bold"
                required
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Qarshi taraf akkountni almashish uchun to‘lashi kerak bo‘lgan summa.
            </p>
          </div>
        )}

        {/* Escrow Guarantee Callout */}
        {mode === 'SMART' ? (
          <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-2.5 text-xs min-w-0">
            <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
            <div className="space-y-0.5 min-w-0 flex-1">
              <p className="font-bold text-foreground text-[11.5px]">100% Xavfsiz Garov (Escrow)</p>
              <p className="text-[10.5px] sm:text-[11px] text-muted-foreground leading-normal break-words">
                To‘lov xaridorning hamyonidan yechiladi va savdo yakunlangunicha platformada saqlanadi.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3 min-w-0">
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
              Inson admin savdosida xaridor admin bilan bevosita to‘lov qiladi.
              Platforma pulni ushlab turmaydi va komissiya olmaydi.
            </div>
            <div>
              <Label className="text-xs font-bold">Admin tanlash</Label>
              <TradeAdminPicker
                value={selectedAdmin?.userId}
                onSelect={(admin) => {
                  setSelectedAdmin(admin);
                  setAdminFee(String(admin.minFeeUzs));
                }}
              />
            </div>
            <div>
              <Label htmlFor="human-admin-fee" className="text-xs font-bold">Admin xizmati narxi (so'm)</Label>
              <Input
                id="human-admin-fee"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={adminFee}
                onChange={(e) => setAdminFee(e.target.value)}
                placeholder={selectedAdmin ? String(selectedAdmin.minFeeUzs) : '30000'}
                className="h-10 rounded-xl text-xs font-bold"
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
          <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-2.5 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Buttons: Responsive Layout */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 text-xs font-bold sm:w-auto"
          >
            Bekor qilish
          </Button>
          <Button
            type="submit"
            disabled={submitting || (needsAmount(kind) && (!effectiveAmountUzs || effectiveAmountUzs <= 0))}
            className="h-10 flex-1 sm:flex-none px-4 text-xs sm:text-sm font-black shadow-md shadow-primary/20"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin shrink-0" />
                <span className="truncate">Yuborilmoqda…</span>
              </>
            ) : (
              <span className="flex items-center justify-center gap-1 truncate w-full">
                <span>Taklif yuborish</span>
                {effectiveAmountUzs > 0 && <span className="font-extrabold truncate">• {formatPriceUZS(effectiveAmountUzs)}</span>}
                <ArrowRight className="ml-1 h-3.5 w-3.5 shrink-0" />
              </span>
            )}
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
    const payload: ProposalAcceptRequest = {};
    startSubmit(async () => {
      const result = await postProposalAccept(proposal.id, payload);
      if (!result.ok) {
        if (isInsufficientFunds(result.error)) {
          await sendBuyerToTopUp(proposal.priceUzs, setError);
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
            <span className="font-semibold text-foreground">Savdo turi:</span>{' '}
            <b className="text-foreground">
              {TRADE_KIND_LABEL_UZ[proposal.kind ?? 'SALE']}
            </b>
          </p>
          {isSwap(proposal.kind) && (
            <p className="mt-0.5">
              Siz ham o&apos;z akkountingizni platforma pochtasiga
              o&apos;tkazasiz. Ikkalangiz tasdiqlagach akkountlar almashinadi.
            </p>
          )}
          {proposal.priceUzs > 0 && (
            <p className="mt-0.5">
              <span className="font-semibold text-foreground">
                {proposal.kind === 'SWAP_SURCHARGE' ? 'Doplata:' : 'Narx:'}
              </span>{' '}
              {formatPriceUZS(proposal.priceUzs)}
            </p>
          )}
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
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md max-h-[92vh] flex flex-col rounded-2xl border border-border bg-card shadow-card-hover overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        <div className="flex items-center justify-between border-b border-border/50 px-3.5 py-2.5 sm:px-4 sm:py-3 shrink-0">
          <h2 className="text-sm sm:text-base font-black text-foreground truncate pr-2">{title}</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 w-8 sm:h-9 sm:w-9 p-0 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
            onClick={onClose}
            aria-label="Yopish"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </Button>
        </div>
        <div className="p-3.5 sm:p-4 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}

async function proposerShortfall(listingPriceUzs: number, surchargeUzs: number) {
  const wallet = await fetchWalletBalance();
  if (wallet === null) return 0;
  return proposerShortfallSom(
    tradeFeeSom(listingPriceUzs), surchargeUzs, wallet.availableTiyin);
}

async function sendToTopUp(
  missing: number,
  returnTo: string | undefined,
  onError: (msg: string) => void,
) {
  if (missing <= 0) {
    onError('Hamyonda mablag‘ bor — qaytadan urinib ko‘ring');
    return;
  }
  try {
    await createInvoice(missing);
  } catch {
    // silent
  }
  window.location.href = topUpHref(missing, returnTo);
}

async function sendBuyerToTopUp(priceUzs: number, onError: (msg: string) => void) {
  const wallet = await fetchWalletBalance();
  if (wallet === null) {
    onError('Hamyon holatini o‘qib bo‘lmadi — hamyon bo‘limidan to‘ldiring');
    return;
  }
  await sendToTopUp(shortfallSom(priceUzs, wallet.availableTiyin), undefined, onError);
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
