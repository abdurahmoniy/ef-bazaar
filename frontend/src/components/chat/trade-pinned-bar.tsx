'use client';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { TradeProposalRejectButton } from './trade-proposal-reject-button';

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Handshake,
  History,
  ShieldCheck,
  Sparkles,
  UserCog,
} from 'lucide-react';

import { CountdownText } from '@/components/trade-admin/countdown-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { isHumanProposal, isHumanTrade } from '@/lib/trade-human';
import {
  hasClearedCurrentStep,
  hasTradeAmount,
  isSwap,
  tradeAmountLabel,
  TRADE_KIND_LABEL_UZ,
} from '@/lib/trade-swap';
import {
  canAcceptTradeProposal,
  isTerminalState,
  TRADE_STATE_LABEL_UZ,
  type TradeResponse,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';
import { useTradeContext } from './trade-context';
import { ReceivedLine, useSwapListingSide } from './swap-accounts-summary';
import { receivedSide } from '@/lib/swap-accounts';

export function TradePinnedBar() {
  const {
    requiresAdminHandoff,
    viewerId,
    activeTrade,
    lastFinished,
    proposal,
    startingNew,
    setStartingNew,
    accountRequest,
    listing,
    trades,
    isDrawerOpen,
    setShowPicker,
    isSeller,
    setShowAcceptModal,
    setShowProposeModal,
    setIsDrawerOpen,
  } = useTradeContext();

  // 1. Pending Proposal Case (can render immediately even on SSR if initialPendingProposal is provided)
  if (proposal) {
    const isHuman = isHumanProposal(proposal);
    return (
      <div className="shrink-0 border-b border-primary/20 bg-primary/10 px-3 py-2 backdrop-blur-md transition-all">
        <div className="trade-pinned-proposal mx-auto max-w-3xl gap-1.5">
          <button
            type="button"
            aria-label="Savdo taklifi tafsilotlari"
            onClick={() => setIsDrawerOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/20 text-primary">
              <Handshake className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                <span className="min-w-0 break-words text-xs font-bold text-foreground">
                  {isSwap(proposal.kind)
                    ? `Almashish (${TRADE_KIND_LABEL_UZ[proposal.kind ?? 'SWAP']})`
                    : 'Savdo taklifi'}
                </span>
                {hasTradeAmount(proposal.kind, proposal.priceUzs) && (
                  <span className="whitespace-nowrap text-xs font-semibold text-foreground">
                    {formatPriceUZS(proposal.priceUzs)}
                  </span>
                )}
                {isHuman && (
                  <Badge variant="info" className="hidden py-0 text-[10px] sm:inline-flex">
                    Inson admin
                  </Badge>
                )}
              </div>
              <p className="text-[10.5px] leading-4 text-muted-foreground">
                {proposal.proposerUserId === viewerId
                  ? 'Javob kutilmoqda'
                  : requiresAdminHandoff ? 'Kelishuvdan so‘ng adminga murojaat qiling' : 'Sizga taklif yuborildi — qabul qiling'}
                {proposal.expiresAt && (
                  <>
                    {' · '}
                    <CountdownText until={proposal.expiresAt} prefix="Muddati: " />
                  </>
                )}
              </p>
            </div>
          </button>

          <div className="trade-pinned-actions flex min-w-0 items-center justify-end gap-1.5">
            <TradeProposalRejectButton />
            {canAcceptTradeProposal(proposal, viewerId) && (
              <Button
                type="button"
                size="sm"
                className="h-9 min-h-9 px-2.5 text-xs font-semibold shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (requiresAdminHandoff) setIsDrawerOpen(true);
                  else setShowAcceptModal(true);
                }}
              >
                <Sparkles className="hidden h-3.5 w-3.5 sm:block" />
                {requiresAdminHandoff ? 'Adminga murojaat' : 'Qabul qilish'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-h-9 w-9 shrink-0 px-0 text-xs sm:w-auto sm:px-2"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Savdo tafsilotlari"
            >
              <span className="sr-only sm:not-sr-only">Batafsil</span>
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active Trade Case (Smart Trade or Human Trade)
  if (activeTrade) {
    return <ActiveTradePinnedBar trade={activeTrade} />;
  }

  // 3. Finished Trade Case (if user hasn't started a new one yet)
  if (lastFinished && !startingNew) {
    const isSuccess = lastFinished.state === 'SUCCESS';
    const isRejected = lastFinished.state === 'REJECTED';
    return (
      <div className="shrink-0 border-b border-border bg-muted/70 px-3 py-1.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Oxirgi savdo tafsilotlari"
            onClick={() => setIsDrawerOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span
              className={cn(
                'grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs',
                isSuccess
                  ? 'bg-success-soft text-success'
                  : isRejected
                    ? 'bg-destructive/20 text-destructive'
                    : 'bg-muted-foreground/20 text-muted-foreground',
              )}
            >
              {isSuccess ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <History className="h-3.5 w-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-[10.5px] leading-4 text-muted-foreground">Oxirgi savdo: </span>
              <span className="block break-words text-xs font-semibold leading-4 text-foreground">
                {TRADE_STATE_LABEL_UZ[lastFinished.state]}
              </span>
              <span className="hidden text-[11px] text-muted-foreground sm:block">
                ({tradeAmountLabel(lastFinished.kind, lastFinished.priceUzs)})
              </span>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 min-h-9 px-2 text-[11px]"
              onClick={() => { setStartingNew(true); setIsDrawerOpen(true); }}
            >
              Yangi savdo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 min-h-9 w-9 px-0 text-[11px] sm:w-auto sm:px-1.5"
              onClick={() => setIsDrawerOpen(true)}
            >
              <span className="sr-only sm:not-sr-only">Ko'rish</span>
              <ChevronDown className="h-3.5 w-3.5 sm:hidden" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // One account summary, using the current request even if this chat began with another listing.
  const selectedListing = accountRequest ? accountRequest.listing : listing;
  if (selectedListing || accountRequest) {
    const title = selectedListing?.description.split('\n')[0]?.trim() || 'Akkount';
    return (
      <div className="shrink-0 border-b border-border bg-card px-3 py-1.5">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <button
            type="button"
            aria-label="So‘ralgan akkount tafsilotlari"
            aria-expanded={Boolean(isDrawerOpen)}
            onClick={() => setIsDrawerOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Handshake className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-foreground">{title}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {selectedListing ? formatPriceUZS(selectedListing.price) : 'E’lon o’chirilgan'}
                {accountRequest && !isSeller && !requiresAdminHandoff && ' · Taklif kutilmoqda'}
              </span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </button>
          {accountRequest && (requiresAdminHandoff || isSeller) && (
            <Button
              type="button"
              size="sm"
              className="min-h-11 shrink-0 px-2.5 text-xs"
              onClick={() => requiresAdminHandoff ? setIsDrawerOpen(true) : setShowProposeModal(true)}
            >
              {requiresAdminHandoff ? 'Adminga murojaat' : 'Taklif yuborish'}
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (trades === null) return null;

  return (
    <div className="shrink-0 border-b border-border bg-card px-3 py-1">
      <Button type="button" variant="ghost" className="min-h-11 w-full justify-start gap-2 text-xs" onClick={() => setShowPicker(true)}>
        <Handshake className="h-4 w-4" />
        Akkount tanlash
        <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
      </Button>
    </div>
  );
}

function ActiveTradePinnedBar({ trade }: { trade: TradeResponse }) {
  const { viewerId, setIsDrawerOpen, isDrawerOpen } = useTradeContext();
  const isHuman = isHumanTrade(trade);
  const isSeller = trade.sellerId === viewerId;
  const isBuyer = trade.buyerId === viewerId;
  const viewerRole = isSeller ? 'SELLER' : isBuyer ? 'BUYER' : null;
  const canTransfer = isSeller || (isBuyer && isSwap(trade.kind));
  const canVerify = isBuyer || (isSeller && isSwap(trade.kind));
  const confirmed = isSeller ? trade.sellerConfirmedAt : isBuyer ? trade.buyerConfirmedAt : null;
  const listingSideForBar = useSwapListingSide(trade.listingId ?? null);
  const received = isSwap(trade.kind) ? receivedSide(trade, viewerId, listingSideForBar) : null;
  const terminal = isTerminalState(trade.state);
  let nextStep = TRADE_STATE_LABEL_UZ[trade.state];
  let actionRequired = false;

  if (hasClearedCurrentStep(trade, viewerRole) || (trade.state === 'WAITING_CLOSE_CONFIRM' && confirmed)) {
    nextStep = 'Ikkinchi taraf kutilmoqda';
  } else {
    switch (trade.state) {
      case 'WAITING_EMAIL_CHANGE':
        nextStep = canTransfer ? 'Emailni almashtiring' : 'Sotuvchi emailni almashtirmoqda';
        actionRequired = canTransfer;
        break;
      case 'VERIFYING_KONAMI_LINK':
        nextStep = canTransfer ? 'Konami tekshiruvini bajaring' : 'Konami tekshirilmoqda';
        actionRequired = canTransfer;
        break;
      case 'WAITING_PASSWORD':
        nextStep = canTransfer ? 'Konami parolini yuboring' : 'Sotuvchidan parol kutilmoqda';
        actionRequired = canTransfer;
        break;
      case 'WAITING_BUYER_VERIFY':
        nextStep = canVerify ? 'Akkountni tekshiring' : 'Xaridor akkountni tekshirmoqda';
        actionRequired = canVerify;
        break;
      case 'WAITING_ADMIN':
        nextStep = isSeller ? 'Adminni tanlang' : 'Admin kutilmoqda';
        actionRequired = isSeller;
        break;
      case 'WAITING_CLOSE_CONFIRM':
        nextStep = 'Savdoni tasdiqlang';
        actionRequired = isSeller || isBuyer;
        break;
    }
  }

  const partnerFinished = !!viewerRole && hasClearedCurrentStep(trade, viewerRole === 'SELLER' ? 'BUYER' : 'SELLER');
  const turnKey = `${trade.id}:${viewerId}:${trade.state}:${partnerFinished}`;
  const previousTurn = useRef({ id: trade.id, viewerId, key: turnKey });
  useEffect(() => {
    const previous = previousTurn.current;
    if (previous.id === trade.id && previous.viewerId === viewerId && previous.key !== turnKey && actionRequired) {
      toast.info('Sizning navbatingiz', {
        description: nextStep,
        action: { label: 'Davom etish', onClick: () => setIsDrawerOpen(true) },
      });
    }
    previousTurn.current = { id: trade.id, viewerId, key: turnKey };
  }, [turnKey, trade.id, viewerId, actionRequired, nextStep, setIsDrawerOpen]);

  return (
    <div className={cn('shrink-0 border-b border-border/80', actionRequired ? 'bg-primary/5' : 'bg-card')}>
      <button
        type="button"
        aria-label="Savdo tafsilotlari"
        aria-expanded={Boolean(isDrawerOpen)}
        onClick={() => setIsDrawerOpen(true)}
        className="mx-auto flex min-h-14 w-full max-w-3xl items-center gap-3 px-4 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <span className="hidden h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-foreground sm:grid" aria-hidden="true">
          {isHuman ? <UserCog className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </span>
        <span className="grid min-w-0 flex-1 gap-1">
          <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="whitespace-nowrap text-sm font-semibold text-foreground">
              {tradeAmountLabel(trade.kind, trade.priceUzs)}
            </span>
            {trade.stateDeadline && !terminal && (
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] tabular-nums text-muted-foreground">
                <Clock className="h-3 w-3" aria-hidden="true" />
                <CountdownText until={trade.stateDeadline} prefix="Qoldi:" />
              </span>
            )}
          </span>
          <span className="flex items-center justify-between gap-3">
            <span className={cn('text-xs leading-4', actionRequired ? 'font-medium text-foreground' : 'text-muted-foreground')}>
              {actionRequired && <span className="font-semibold">Sizning navbatingiz · </span>}{nextStep}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-foreground">
              {actionRequired ? 'Davom etish' : 'Batafsil'}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </span>
          {actionRequired && partnerFinished && <span role="status" className="text-[11px] text-muted-foreground">Sherigingiz bu bosqichni bajardi</span>}
          {received && <ReceivedLine side={received} />}
        </span>
      </button>
    </div>
  );
}
