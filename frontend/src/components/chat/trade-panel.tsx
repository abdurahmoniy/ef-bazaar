'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useChatViewport } from '@/hooks/use-chat-viewport';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  AlertTriangle,
  ArrowRight,
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
import { isConfirmLocked, loginCodeOf, receivingMailboxEmail } from '@/lib/trade-login-code';
import { HumanPartyTradePanel } from '@/components/trade-admin/human-party-trade-panel';
import { TradeAdminPicker } from '@/components/trade-admin/trade-admin-picker';
import { SellerRatingForm } from '@/components/chat/seller-rating-form';
import { CompletedTradeInvite } from '@/components/growth/completed-trade-invite';
import { DivisionBadge, toDivisionLevel } from '@/components/marketplace/division-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { formatDayLabel, formatMessageTime } from '@/lib/chat-format';
import { PROPOSAL_STATUS_LABELS, tradeProposalDetails } from '@/lib/trade-proposal-details';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { listingMediaUrl, listingMediaUrls } from '@/lib/marketplace-media';
import type { ChatResponse, ListingResponse, MessageResponse } from '@/lib/marketplace-types';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import { isHumanProposal, isHumanTrade, validateAdminFee } from '@/lib/trade-human';
import { createInvoice } from '@/lib/payment-client';
import {
  allowedKinds,
  counterpartStatus,
  isSwap,
  hasClearedCurrentStep,
  hasTradeAmount,
  tradeAmountLabel,
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
import { canUseSmartAdmin, resolveTradeListing } from '@/lib/trade-platform';
import { TradeProgressTimeline } from './trade-progress-timeline';
import { TradeAdminHandoff } from './trade-admin-handoff';
import { useTradeContext, type PendingProposal } from './trade-context';

/** Trade details stay in a sheet; primary actions can open their own dialog. */
export function TradePanel() {
  const { isDrawerOpen, setIsDrawerOpen, proposal, accountRequest, listing, viewedTrade, viewedProposal } = useTradeContext();
  const listingId = viewedProposal ? tradeProposalDetails(viewedProposal, proposal).listingId : viewedTrade ? viewedTrade.listingId : proposal?.listingId ?? accountRequest?.listingId ?? listing?.id;

  if (!isDrawerOpen) return <TradeActionModals />;

  return (
    <ModalShell title="Savdo tafsilotlari" sheet onClose={() => setIsDrawerOpen(false)}>
      {viewedProposal ? <ProposalDetails message={viewedProposal} /> : <TradePanelContent />}
      {listingId && (
        <Link href={`/marketplace/${listingId}`} className="mt-3 flex min-h-11 items-center justify-center gap-2 text-sm font-medium text-primary hover:underline">
          E’lonni ko‘rish <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {!viewedTrade && (!viewedProposal || (viewedProposal.proposalId === proposal?.id &&
        tradeProposalDetails(viewedProposal, proposal).outcome === 'PENDING')) && <TradeActionModals />}
    </ModalShell>
  );
}

/** The selected message is the source of historical details, never the latest trade. */
function ProposalDetails({ message }: { message: MessageResponse }) {
  const { proposal, listing, accountRequest, viewerId, trades, reload, refreshing,
    setShowAcceptModal, requiresAdminHandoff } = useTradeContext();
  const { matching, price, kind, listingId, expiresAt, outcome } = tradeProposalDetails(message, proposal);
  const ownListing = [listing, accountRequest?.listing].find(item => item?.id === listingId);
  const trade = message.proposalTradeId ? trades?.find(item => item.id === message.proposalTradeId) : null;
  const sentAt = `${formatDayLabel(message.createdAt)} · ${formatMessageTime(message.createdAt)}`;
  const statusTone = outcome === 'ACCEPTED' ? 'text-emerald-600 dark:text-emerald-400'
    : outcome === 'REJECTED' ? 'text-destructive' : 'text-muted-foreground';

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4" aria-label="Taklif ma’lumotlari">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted-foreground">{isSwap(kind) ? 'Almashish taklifi' : 'Savdo taklifi'}</p>
          <Badge variant="outline" className={statusTone}>{PROPOSAL_STATUS_LABELS[outcome]}</Badge>
        </div>
        <p className="break-words text-2xl font-bold tracking-tight">
          {kind === 'SWAP' ? 'Akkount almashish' : typeof price === 'number' && price > 0
            ? formatPriceUZS(price) : 'Summa ko‘rsatilmagan'}
        </p>
        <dl className="space-y-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Yuborilgan vaqt</dt>
            <dd><time dateTime={message.createdAt}>{sentAt}</time></dd></div>
          <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Yuboruvchi</dt>
            <dd>{message.senderId === viewerId ? 'Siz' : 'Suhbatdoshingiz'}</dd></div>
          {kind === 'SWAP_SURCHARGE' && <div className="flex justify-between gap-2"><dt className="text-muted-foreground">Savdo turi</dt><dd>Doplata bilan almashish</dd></div>}
          {listingId && <div className="space-y-1 border-t border-border pt-3"><dt className="text-muted-foreground">E’lon</dt>
            <dd className="break-words font-medium">{ownListing?.description?.split('\n')[0]?.trim() || 'Taklifga biriktirilgan e’lon'}</dd></div>}
          {expiresAt && <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Amal qilish muddati</dt>
            <dd><time dateTime={expiresAt}>{formatDayLabel(expiresAt)} · {formatMessageTime(expiresAt)}</time></dd></div>}
        </dl>
      </section>

      <TradeProgressTimeline outcome={outcome} trade={trade} kind={kind} mode={matching?.mode} createdAt={message.createdAt} />

      {outcome === 'PENDING' && matching && (
        requiresAdminHandoff ? <TradeAdminHandoff listingId={listingId} platform={ownListing?.attributes?.platform} amountUzs={price} />
          : message.senderId !== viewerId ? <Button className="min-h-11 w-full" onClick={() => setShowAcceptModal(true)}>Qabul qilish</Button>
            : <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Javob kutilmoqda</p>
      )}
      {message.proposalTradeId && (trade ? (
        <section className="border-t border-border pt-4" aria-label="Savdo jarayoni">
          {isHumanTrade(trade)
            ? <HumanPartyTradePanel key={trade.id} trade={trade} viewerId={viewerId} onRefresh={reload} />
            : <ActiveTradeCard key={`${trade.id}:${viewerId}:${trade.passwordMessageId}`} trade={trade} viewerId={viewerId} onRefresh={reload} refreshing={refreshing} embedded showSummary={false} />}
        </section>
      ) : <div className="space-y-2 rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">
        <p>{trades === null ? 'Savdo holati yuklanmoqda…' : 'Bu taklifga tegishli savdoni yuklab bo‘lmadi.'}</p>
        <Button variant="outline" disabled={refreshing} onClick={() => void reload()}>Qayta urinish</Button>
      </div>)}
      {outcome === 'ACCEPTED' && !message.proposalTradeId && <p className="rounded-xl bg-muted/40 p-3 text-sm text-muted-foreground">Bu eski taklifning savdo tafsilotlari mavjud emas.</p>}
    </div>
  );
}

// Keep one modal host, including when an action is started from the pinned bar.
function TradeActionModals() {
  const {
    chat, viewerId, listing, otherPartyId, accountRequest, setAccountRequest, viewedProposal,
    trades, activeTrade, lastFinished, startingNew, proposal, isSeller,
    requiresAdminHandoff, showPicker, setShowPicker, showProposeModal,
    setShowProposeModal, showAcceptModal, setShowAcceptModal,
    handleProposalCreated, handleProposalAccepted,
  } = useTradeContext();

  if (trades === null || activeTrade || (lastFinished && !startingNew && !proposal)) return null;

  if (proposal) {
    return showAcceptModal && (viewedProposal ? viewedProposal.senderId !== viewerId : !isSeller) && !requiresAdminHandoff ? (
      <AcceptModal
        proposal={proposal}
        onClose={() => setShowAcceptModal(false)}
        onAccepted={handleProposalAccepted}
      />
    ) : null;
  }

  return (
    <>
      {showProposeModal && isSeller && canUseSmartAdmin(resolveTradeListing(accountRequest, listing)) && (
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
    </>
  );
}

function TradePanelContent() {
  const {
    viewerId, listing, accountRequest, role, isSeller, trades, activeTrade,
    lastFinished, proposal, setProposal, startingNew, setStartingNew,
    refreshing, reload, setShowPicker, setShowProposeModal, setShowAcceptModal, viewedTrade,
  } = useTradeContext();

  const selectedListing = resolveTradeListing(accountRequest, listing);
  const smartAdminAvailable = canUseSmartAdmin(selectedListing);

  // Nothing to render while the first fetch is in flight
  if (trades === null) {
    return (
      <div className="mx-auto max-w-md rounded-2xl border border-border bg-muted/30 px-4 py-3 text-[11.5px] text-muted-foreground">
        Savdo holati yuklanmoqda…
      </div>
    );
  }

  if (viewedTrade) {
    const selected = trades.find(trade => trade.id === viewedTrade.id);
    if (!selected) {
      return <div className="space-y-2 text-sm text-muted-foreground">
        <p>Bu taklifga tegishli savdoni yuklab bo‘lmadi.</p>
        <Button variant="outline" disabled={refreshing} onClick={() => void reload()}>Qayta urinish</Button>
      </div>;
    }
    return <TradeDetails trade={selected} viewerId={viewerId} onRefresh={reload} refreshing={refreshing} />;
  }

  // The pinned bar prioritizes a pending request over any existing trade.
  if (proposal) {
    return <PendingProposalCard proposal={proposal} isSeller={isSeller}
      onAcceptClick={() => setShowAcceptModal(true)} onDismiss={() => setProposal(null)} />;
  }

  if (activeTrade) {
    return <TradeDetails trade={activeTrade} viewerId={viewerId} onRefresh={reload} refreshing={refreshing} />;
  }

  // ---- a trade that has ended, still on screen until they move past it ----
  if (lastFinished && !startingNew && !proposal) {
    return (
      <div className="space-y-2">
        <TradeDetails trade={lastFinished} viewerId={viewerId} onRefresh={reload} refreshing={refreshing} />
        <Button
          type="button"
          variant="outline"
          className="mx-auto block w-full max-w-md"
          onClick={() => setStartingNew(true)}
        >
          Yangi savdo boshlash
        </Button>
        <CompletedTradeInvite state={lastFinished.state} />
      </div>
    );
  }

  // ---- no trade, no pending proposal ----
  return (
    <div className="mx-auto max-w-md">
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
              : !smartAdminAvailable
                ? 'Kelishuvdan so‘ng adminga murojaat qiling'
                : isSeller ? 'Xaridorga taklif yuboring' : 'Sotuvchi taklifini kuting'}
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

      {role !== null && !smartAdminAvailable ? (
        <TradeAdminHandoff
          listingId={accountRequest?.listingId ?? selectedListing?.id}
          platform={selectedListing?.attributes?.platform}
        />
      ) : isSeller ? (
        <Button
          type="button"
          className="w-full"
          onClick={() => setShowProposeModal(true)}
        >
          Taklif yuborish
        </Button>
      ) : null}

      {!accountRequest && (
        <Button
          type="button"
          className="mt-2 w-full"
          onClick={() => setShowPicker(true)}
        >
          Akkount so’rash
        </Button>
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
          <p className="line-clamp-2 text-sm font-semibold text-foreground">
            {listing.description.split('\n')[0]?.trim() || "E’lon"}
          </p>
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
        className="mt-1 min-h-11 text-xs font-medium text-primary underline-offset-2 hover:underline"
      >
        Boshqa akkount tanlash
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

function TradeDetails({ trade, viewerId, onRefresh, refreshing }: {
  trade: TradeResponse;
  viewerId: string;
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
}) {
  const statusTone = trade.state === 'SUCCESS' ? 'text-emerald-700 dark:text-emerald-400'
    : isTerminalState(trade.state) ? 'text-red-700 dark:text-red-400' : 'text-yellow-800 dark:text-yellow-300';
  return <div className="space-y-5">
    <section aria-label="Savdo ma’lumotlari" className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-muted-foreground">{isSwap(trade.kind) ? 'Almashish' : 'Savdo'}</p>
        <Badge variant="outline" className={cn('whitespace-normal', statusTone)}>{TRADE_STATE_LABEL_UZ[trade.state]}</Badge>
      </div>
      <p className="break-words text-2xl font-bold tracking-tight">{tradeAmountLabel(trade.kind, trade.priceUzs)}</p>
      <dl className="space-y-3 text-sm">
        {trade.createdAt && <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Savdo boshlangan vaqt</dt>
          <dd><time dateTime={trade.createdAt}>{formatDayLabel(trade.createdAt)} · {formatMessageTime(trade.createdAt)}</time></dd></div>}
        <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Sizning rolingiz</dt>
          <dd>{trade.sellerId === viewerId ? 'Sotuvchi' : trade.buyerId === viewerId ? 'Xaridor' : '—'}</dd></div>
        {trade.stateDeadline && !isTerminalState(trade.state) && <div className="flex flex-wrap justify-between gap-2"><dt className="text-muted-foreground">Bosqich uchun qolgan vaqt</dt>
          <dd className="tabular-nums"><CountdownText until={trade.stateDeadline} /></dd></div>}
      </dl>
    </section>
    <TradeProgressTimeline outcome="ACCEPTED" trade={trade} tradeCreatedAt={trade.createdAt} />
    <section aria-label="Savdo jarayoni" className="border-t border-border pt-4">
      {isHumanTrade(trade)
        ? <HumanPartyTradePanel key={trade.id} trade={trade} viewerId={viewerId} onRefresh={onRefresh} />
        : <ActiveTradeCard key={`${trade.id}:${viewerId}:${trade.passwordMessageId}`} trade={trade} viewerId={viewerId}
            onRefresh={onRefresh} refreshing={refreshing} embedded showSummary={false} />}
    </section>
  </div>;
}

function ActiveTradeCard({
  trade,
  viewerId,
  onRefresh,
  refreshing,
  embedded = false,
  showSummary = true,
}: {
  trade: TradeResponse;
  viewerId: string;
  onRefresh: () => Promise<void> | void;
  refreshing: boolean;
  embedded?: boolean;
  showSummary?: boolean;
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
    <div className={cn(
      'mx-auto max-w-md space-y-4',
      !embedded && 'rounded-2xl border border-border bg-card p-4 shadow-card',
    )}>
      {showSummary && <div className="space-y-2.5 border-b border-border pb-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="whitespace-nowrap text-xl font-bold tracking-tight text-foreground">
            {tradeAmountLabel(trade.kind, trade.priceUzs)}
          </p>
          {trade.stateDeadline && !isTerminalState(trade.state) && (
            <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              <CountdownText until={trade.stateDeadline} prefix="Qoldi:" />
            </span>
          )}
        </div>
        <p className="flex items-start gap-2 text-sm font-medium leading-snug text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          {TRADE_STATE_LABEL_UZ[trade.state]}
        </p>
      </div>}

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

      <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
        <span className="min-w-0">
          {trade.role === 'SELLER'
            ? 'Sotuvchi'
            : trade.role === 'BUYER'
              ? 'Xaridor'
              : '—'}
          <span className="ml-2 text-[11px]">· {shortId}</span>
        </span>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={refreshing}
          className="min-h-11 shrink-0 rounded-lg px-2 font-medium text-foreground underline-offset-2 hover:underline disabled:opacity-50"
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
    <div className="space-y-4">
      <div className="space-y-2 text-sm">
        <p className="font-semibold text-foreground">1. Konami emailini o‘zgartiring</p>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Konami saytida akkount emailini quyidagi manzilga o‘zgartiring.
        </p>
        {email ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 py-1 pl-3 pr-1">
            <code className="min-w-0 flex-1 break-all py-2 font-mono text-sm leading-relaxed text-foreground select-all">
              {email}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-11 shrink-0 px-0"
              onClick={copyEmail}
              aria-label="Emailni nusxa olish"
            >
              {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="sr-only" role="status">{copied ? 'Nusxalandi' : ''}</span>
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">Manzil tayyorlanmoqda…</p>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <p className="font-semibold text-foreground">2. Tasdiqlash kodini kiriting</p>
        {code ? (
          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 py-1 pl-3 pr-1">
            <code className="min-w-0 flex-1 break-all py-2 font-mono text-xl font-bold tracking-widest text-foreground select-all">
              {code}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 w-11 shrink-0 px-0"
              onClick={copyCode}
              aria-label="Kodni nusxa olish"
            >
              {codeCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              <span className="sr-only" role="status">{codeCopied ? 'Nusxalandi' : ''}</span>
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-muted/40 p-3 text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
            Konami tasdiqlash kodi kutilmoqda…
          </div>
        )}
        <p className="text-sm leading-relaxed text-muted-foreground">
          {code
            ? 'Bu kodni Konami sahifasidagi email o‘zgartirish oynasiga kiriting.'
            : 'Kod shu yerda avtomatik chiqadi. Kod kelgach tasdiqlash tugmasi faollashadi.'}
        </p>
      </div>

      <Button
        type="button"
        className="w-full disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
        onClick={() => setShowModal(true)}
        disabled={submitting || !email || !code}
      >
        Email o‘zgartirdim
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
      <div className="text-sm">
        <p className="font-semibold">Konami parolini tiklashni so‘rang</p>
        <ol className="mt-2 list-decimal space-y-2 pl-5 leading-relaxed text-muted-foreground">
          <li>Pastdagi tugma orqali Konami parol tiklash sahifasini oching.</li>
          <li>Sahifada quyidagi emailni kiriting (yoki nusxa oling) va &quot;Send&quot; tugmasini bosing.</li>
          <li>Xat kelishini avtomatik tekshiramiz. Kelgach savdo keyingi bosqichga o‘tadi.</li>
        </ol>
      </div>

      {mailboxEmail && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 py-1 pl-3 pr-1">
          <code className="min-w-0 flex-1 break-all py-2 font-mono text-sm leading-relaxed select-all">{mailboxEmail}</code>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-11 w-11 shrink-0 px-0"
            onClick={copyEmail}
            aria-label="Emailni nusxa olish"
          >
            {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="sr-only" role="status">{copied ? 'Nusxalandi' : ''}</span>
          </Button>
        </div>
      )}

      <Button type="button" className="w-full" onClick={openKonami}>
        Konami sahifasini ochish
      </Button>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={recheck}
        disabled={submitting}
      >
        <RefreshCw className={cn('mr-2 h-3.5 w-3.5', submitting && 'animate-spin')} />
        {submitting ? 'Tekshirilmoqda…' : 'Xat kelganini tekshirish'}
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
      <p className="text-sm leading-relaxed text-muted-foreground">
        Yangi Konami parolini xavfsiz shakl orqali yuboring. Xaridor uni savdoning keyingi bosqichida ochadi.
      </p>
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
  const [codeCopied, setCodeCopied] = useState(false);
  const [requestingCode, startCodeRequest] = useTransition();
  const revealStorageKey = `trade-password-opened:${trade.id}:${trade.passwordMessageId}`;
  const [passwordOpened, setPasswordOpened] = useState(() => {
    try {
      return window.localStorage.getItem(revealStorageKey) === '1';
    } catch {
      return false;
    }
  });

  function rememberPasswordOpened() {
    setPasswordOpened(true);
    try {
      // Persist only the one-time reveal status, never the password itself.
      window.localStorage.setItem(revealStorageKey, '1');
    } catch {
      // Keep the current panel usable when browser storage is unavailable.
    }
  }
  // Obmenda qutilar teskari: kirib tekshiriladigani qarshi tomonniki.
  const mailboxEmail = receivingMailboxEmail(trade);

  // Konami kirish kodi: akkountga kirayotganda pochtaga keladi, pochta esa
  // hali platformada. Kod kelmaguncha tasdiqlash yopiq — lekin 2FA
  // so'ramaydigan akkountlar ham bor, shuning uchun backend bir muddatdan
  // keyin tugmani baribir ochadi va shu vaqt confirmUnlocksAt da keladi.
  const loginCode = loginCodeOf(trade);
  const confirmUnlocksAt = trade.confirmUnlocksAt ?? null;
  const confirmLocked = isConfirmLocked(trade);

  function requestLoginCode() {
    onActionError(null);
    startCodeRequest(async () => {
      const r = await postTradeAction(trade.id, 'login-code');
      if (!r.ok) {
        onActionError(r.error);
        return;
      }
      await onRefresh();
    });
  }

  async function copyLoginCode() {
    if (!loginCode) return;
    try {
      await navigator.clipboard.writeText(loginCode);
      setCodeCopied(true);
      window.setTimeout(() => setCodeCopied(false), 1500);
    } catch {
      // silent
    }
  }

  function reveal() {
    if (!trade.passwordMessageId) {
      onActionError('Parol xabari topilmadi — sahifani yangilang.');
      return;
    }
    onActionError(null);
    startReveal(async () => {
      const r = await postReveal(trade.id, trade.passwordMessageId!);
      if (!r.ok) {
        if (r.status === 410) rememberPasswordOpened();
        onActionError(r.error);
        setShowRevealModal(false);
        return;
      }
      rememberPasswordOpened();
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
    <div className="space-y-3">
      {revealedPassword || passwordOpened ? (
        <>
          <div className="space-y-3">
            {mailboxEmail && (
              <div>
                <p className="mb-2 text-sm font-semibold text-foreground">
                  Konami email
                </p>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 py-1 pl-3 pr-1">
                  <code className="min-w-0 flex-1 break-all py-2 font-mono text-sm leading-relaxed text-foreground select-all">
                    {mailboxEmail}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 shrink-0 px-0"
                    onClick={copyEmail}
                    aria-label="Emailni nusxa olish"
                  >
                    {emailCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="sr-only" role="status">{emailCopied ? 'Nusxalandi' : ''}</span>
                  </Button>
                </div>
              </div>
            )}
            {revealedPassword && <div>
              <p className="mb-2 text-sm font-semibold text-foreground">
                Konami paroli
              </p>
              <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 py-1 pl-3 pr-1">
                <code className="min-w-0 flex-1 break-all py-2 font-mono text-sm leading-relaxed text-foreground select-all">
                  {revealedPassword}
                </code>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 w-11 shrink-0 px-0"
                  onClick={copyPw}
                  aria-label="Parolni nusxa olish"
                >
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  <span className="sr-only" role="status">{copied ? 'Nusxalandi' : ''}</span>
                </Button>
              </div>
            </div>}
            <p className="text-sm leading-relaxed text-muted-foreground">
              {revealedPassword
                ? 'Yuqoridagi email + parol bilan Konami akkauntga kira olganingizni tekshiring. Parol qayta ochilmaydi.'
                : 'Parol qayta ochilmaydi. Akkountga kira olgan bo‘lsangiz tasdiqlang, kira olmagan bo‘lsangiz rad eting.'}
            </p>

            <div className="space-y-2 rounded-xl border border-border bg-muted/20 p-3">
              <p className="text-sm font-semibold text-foreground">Kirish kodi</p>
              {loginCode ? (
                <div className="flex items-center gap-2 rounded-xl border border-border bg-background py-1 pl-3 pr-1">
                  <code className="min-w-0 flex-1 break-all py-2 font-mono text-lg tracking-widest text-foreground select-all">
                    {loginCode}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 w-11 shrink-0 px-0"
                    onClick={copyLoginCode}
                    aria-label="Kodni nusxa olish"
                  >
                    {codeCopied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    <span className="sr-only" role="status">{codeCopied ? 'Nusxalandi' : ''}</span>
                  </Button>
                </div>
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Kirishda Konami pochtaga tasdiqlash kodi yuboradi. Pochta hali
                    platformada, shuning uchun kodni shu yerda ko&apos;rsatamiz —
                    odatda bir necha soniyada chiqadi.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={requestLoginCode}
                    disabled={requestingCode}
                  >
                    {requestingCode ? 'So‘ralmoqda…' : 'Kodni qayta so‘rash'}
                  </Button>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              className="flex-1"
              onClick={() => setShowConfirmModal(true)}
              disabled={confirming || rejecting || confirmLocked}
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
          {confirmLocked && (
            <p className="text-xs leading-relaxed text-muted-foreground">
              Avval akkountga kiring: kirish kodi kelgach tasdiqlash ochiladi.
              Konami kod so&apos;ramagan bo&apos;lsa, tugma{' '}
              <CountdownText until={confirmUnlocksAt} /> dan keyin baribir ochiladi.
              Kira olmayotgan bo&apos;lsangiz — rad etish har doim ochiq.
            </p>
          )}
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
          {trade.kind === 'SWAP'
            ? 'Akkountlar o‘zaro almashtirildi. Tabriklaymiz!'
            : `${formatPriceUZS(trade.priceUzs)} to‘landi va Konami akkaunti o‘tkazildi. Tabriklaymiz!`}
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
}: {
  proposal: PendingProposal;
  isSeller: boolean;
  onAcceptClick: () => void;
  onDismiss: () => void;
}) {
  const { listing, accountRequest, requiresAdminHandoff } = useTradeContext();
  const selectedListing = resolveTradeListing(accountRequest, listing);
  const proposalListing = [selectedListing, listing].find((item) => item?.id === proposal.listingId);

  return (
    <div className="mx-auto max-w-md space-y-5">
      <div className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-4">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <Handshake className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">
            {isSwap(proposal.kind) ? 'Almashish taklifi' : 'Taklif yuborildi'}
          </p>
          <p className="mt-2 text-2xl font-bold tracking-tight text-foreground">
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
      {proposal.expiresAt && <p className="text-sm text-muted-foreground"><CountdownText until={proposal.expiresAt} prefix="Muddati: " /></p>}
      <TradeProgressTimeline outcome="PENDING" kind={proposal.kind} mode={isHumanProposal(proposal) ? 'HUMAN' : proposal.mode} />
      {requiresAdminHandoff ? (
        <TradeAdminHandoff listingId={proposal.listingId} platform={proposalListing?.attributes?.platform} amountUzs={proposal.priceUzs} />
      ) : isSeller ? (
        <p className="rounded-lg border border-border/50 bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
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
  const effectiveListing = resolveTradeListing(accountRequest, listing);
  const originalPrice = effectiveListing ? Number(effectiveListing.price) : 0;
  const initialPrice = originalPrice > 0 ? String(Math.trunc(originalPrice)) : '';
  const coverUrl =
    accountRequest?.listing?.coverMessageId
      ? listingMediaUrl(accountRequest.listing.coverMessageId)
      : listing
        ? listingMediaUrls(listing, 1)[0]
        : null;
  const listingAttributes =
    effectiveListing && 'attributes' in effectiveListing && effectiveListing.attributes
      ? effectiveListing.attributes
      : (listing && 'attributes' in listing ? listing.attributes : undefined);
  const divLevel =
    listingAttributes?.highest_division_level
      ? toDivisionLevel(listingAttributes.highest_division_level)
      : undefined;

  const listingExchangeMode = (
    (effectiveListing && 'exchangeMode' in effectiveListing && effectiveListing.exchangeMode
      ? effectiveListing.exchangeMode
      : undefined) ?? listingAttributes?.exchange_mode
  ) as ExchangeMode | undefined;
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

  const { commissionConfig } = useTradeContext();
  const priceNum = Number(price);
  const hasValidPrice = Number.isFinite(priceNum) && priceNum > 0;
  const feeNum = hasValidPrice ? tradeFeeSom(priceNum, commissionConfig) : 0;
  const proceedsNum = hasValidPrice ? sellerProceedsSom(priceNum, commissionConfig) : 0;

  const surchargeNum = Number(surcharge);
  const hasValidSurcharge = Number.isFinite(surchargeNum) && surchargeNum > 0;
  const swapFeeBase = originalPrice > 0 ? originalPrice : 0;
  const swapFeeNum = swapFeeBase > 0 ? tradeFeeSom(swapFeeBase, commissionConfig) : 0;

  const swapSurchargeFeeBase = originalPrice > 0 ? originalPrice : (hasValidSurcharge ? surchargeNum : 0);
  const swapSurchargeFeeNum = swapSurchargeFeeBase > 0 ? tradeFeeSom(swapSurchargeFeeBase, commissionConfig) : 0;
  const swapSurchargeNetProceeds = Math.max(0, surchargeNum - swapSurchargeFeeNum);
  const swapSurchargeProposerOwes = Math.max(0, swapSurchargeFeeNum - surchargeNum);

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

  if (!canUseSmartAdmin(effectiveListing)) {
    return (
      <ModalShell title="Admin orqali savdo" onClose={onClose}>
        <TradeAdminHandoff
          listingId={accountRequest?.listingId ?? effectiveListing?.id}
          platform={effectiveListing?.attributes?.platform}
        />
      </ModalShell>
    );
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
          <div className="space-y-2">
            <div className="space-y-1">
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

            {/* Financial Breakdown Card */}
            {mode === 'SMART' && hasValidSurcharge && (
              <div className="rounded-xl border border-border bg-muted/20 p-2.5 sm:p-3 space-y-1.5 text-xs min-w-0">
                <div className="flex items-center justify-between gap-2 text-muted-foreground text-[11.5px]">
                  <span className="shrink-0">Qarshi taraf to‘laydi (doplata):</span>
                  <span className="font-bold text-foreground truncate">{formatPriceUZS(surchargeNum)}</span>
                </div>
                <div className="flex items-center justify-between gap-2 text-muted-foreground text-[11.5px]">
                  <span className="shrink-0">Smart-admin xizmati:</span>
                  <span className="font-semibold text-destructive truncate">
                    −{formatPriceUZS(swapSurchargeFeeNum)}
                  </span>
                </div>
                <div className="border-t border-border/60 pt-1.5 flex items-center justify-between gap-2">
                  {surchargeNum >= swapSurchargeFeeNum ? (
                    <>
                      <span className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300 text-xs shrink-0">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                        Sizga sof doplata:
                      </span>
                      <span className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-300 truncate">
                        {formatPriceUZS(swapSurchargeNetProceeds)}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="flex items-center gap-1 font-bold text-amber-700 dark:text-amber-300 text-xs shrink-0">
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                        Yetishmagan xizmat haqi:
                      </span>
                      <span className="text-xs sm:text-sm font-black text-amber-700 dark:text-amber-300 truncate">
                        {formatPriceUZS(swapSurchargeProposerOwes)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Swap Financial Breakdown Card */}
        {kind === 'SWAP' && mode === 'SMART' && swapFeeNum > 0 && (
          <div className="rounded-xl border border-border bg-muted/20 p-2.5 sm:p-3 space-y-1.5 text-xs min-w-0">
            <div className="flex items-center justify-between gap-2 text-muted-foreground text-[11.5px]">
              <span className="shrink-0">Qarshi taraf to‘laydi:</span>
              <span className="font-bold text-foreground truncate">Pul o‘tmaydi</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-muted-foreground text-[11.5px]">
              <span className="shrink-0">Smart-admin xizmati:</span>
              <span className="font-semibold text-destructive truncate">
                −{formatPriceUZS(swapFeeNum)}
              </span>
            </div>
            <div className="border-t border-border/60 pt-1.5 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300 text-xs shrink-0">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                Xizmat haqi (taklifchidan):
              </span>
              <span className="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-300 truncate">
                {formatPriceUZS(swapFeeNum)}
              </span>
            </div>
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
  const { listing, accountRequest } = useTradeContext();
  const selectedListing = resolveTradeListing(accountRequest, listing);
  const proposalListing = proposal.listingId
    ? [selectedListing, listing].find((item) => item?.id === proposal.listingId) ?? null
    : null;
  const requiresAdmin = !isHumanProposal(proposal) && !canUseSmartAdmin(proposalListing);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (requiresAdmin) return;
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

  if (requiresAdmin) {
    return (
      <ModalShell title="Admin orqali savdo" onClose={onClose}>
        <TradeAdminHandoff
          listingId={proposal.listingId}
          platform={proposalListing?.attributes?.platform}
          amountUzs={proposal.priceUzs}
        />
      </ModalShell>
    );
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
          {isSwap(proposal.kind) && !isHumanProposal(proposal) && (
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
        {/* Toza obmenda hamyondan hech narsa yechilmaydi — bu qator
            "0 so'm yechilib..." bo'lib chiqardi. */}
        {!isHumanProposal(proposal) && hasTradeAmount(proposal.kind, proposal.priceUzs) && (
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
  sheet = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  sheet?: boolean;
}) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const viewport = useChatViewport();
  const content = (
    <Dialog.Overlay style={viewport ? {
      top: viewport.offsetTop,
      bottom: 'auto',
      height: `min(${viewport.height}px, var(--tg-viewport-height, 100dvh))`,
      paddingTop: 'max(1rem, var(--app-content-safe-top, 0px))',
      paddingLeft: 'max(0.75rem, var(--app-content-safe-left, 0px))',
      paddingRight: 'max(0.75rem, var(--app-content-safe-right, 0px))',
      ...(sheet ? {
        paddingLeft: 'var(--app-content-safe-left, 0px)',
        paddingRight: 'var(--app-content-safe-right, 0px)',
      } : {}),
    } : undefined} className={cn(
      'fixed inset-0 z-50 flex justify-center bg-black/60 sm:items-center sm:p-4',
      sheet ? 'items-end' : 'items-center p-3',
    )}>
      <Dialog.Content
        aria-describedby={undefined}
        style={viewport ? { maxHeight: '100%' } : undefined}
        onOpenAutoFocus={() => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement
            ? document.activeElement : null;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current?.focus();
        }}
        className={cn(
          'relative flex w-full max-w-md flex-col overflow-hidden border border-border bg-card shadow-card-hover outline-none',
          sheet
            ? 'max-h-[calc(100dvh-1rem)] rounded-t-2xl sm:max-h-[90dvh] sm:rounded-2xl'
            : 'max-h-[90dvh] rounded-2xl',
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
          <Dialog.Title className="min-w-0 pr-2 text-base font-bold text-foreground">{title}</Dialog.Title>
          <Dialog.Close asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Yopish"
            >
              <X className="h-5 w-5" />
            </Button>
          </Dialog.Close>
        </div>
        <div className={cn(
          'min-h-0 overflow-y-auto overscroll-contain p-4',
          sheet && 'pb-[calc(1rem+var(--app-content-safe-bottom,0px))]',
        )}>{children}</div>
      </Dialog.Content>
    </Dialog.Overlay>
  );

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      {sheet ? <Dialog.Portal>{content}</Dialog.Portal> : content}
    </Dialog.Root>
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

type MutationResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };

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
  path: 'payment-confirmed' | 'email-changed' | 'recheck' | 'confirm' | 'reject' | 'login-code',
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
      return { ok: false, status: 410, error: 'Parol allaqachon ochilgan yoki muddati tugagan' };
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
