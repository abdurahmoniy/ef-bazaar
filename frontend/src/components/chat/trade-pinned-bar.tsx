'use client';

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
  isSwap,
  TRADE_KIND_LABEL_UZ,
} from '@/lib/trade-swap';
import {
  isTerminalState,
  TRADE_STATE_LABEL_UZ,
  type TradeResponse,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';
import { useTradeContext } from './trade-context';

export function TradePinnedBar() {
  const {
    requiresAdminHandoff,
    activeTrade,
    lastFinished,
    proposal,
    startingNew,
    setStartingNew,
    accountRequest,
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
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
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
                <span className="truncate text-xs font-bold text-foreground">
                  {isSwap(proposal.kind)
                    ? `Almashish (${TRADE_KIND_LABEL_UZ[proposal.kind ?? 'SWAP']})`
                    : 'Savdo taklifi'}
                </span>
                <span className="whitespace-nowrap text-xs font-semibold text-foreground">
                  {formatPriceUZS(proposal.priceUzs)}
                </span>
                {isHuman && (
                  <Badge variant="info" className="hidden py-0 text-[10px] sm:inline-flex">
                    Inson admin
                  </Badge>
                )}
              </div>
              <p className="truncate text-[10.5px] text-muted-foreground">
                {isSeller
                  ? 'Xaridor javobini kutmoqda'
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

          <div className="flex shrink-0 items-center gap-1.5">
            {!isSeller && (
              <Button
                type="button"
                size="sm"
                className="min-h-11 px-2.5 text-xs font-semibold shadow-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  if (requiresAdminHandoff) setIsDrawerOpen(true);
                  else setShowAcceptModal(true);
                }}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                {requiresAdminHandoff ? 'Adminga murojaat' : 'Qabul qilish'}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 min-w-11 px-2 text-xs"
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
                  ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
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
              <span className="truncate text-xs font-semibold text-foreground">
                Oxirgi savdo: {TRADE_STATE_LABEL_UZ[lastFinished.state]}
              </span>
              <span className="ml-1.5 hidden text-[11px] text-muted-foreground sm:inline">
                ({formatPriceUZS(lastFinished.priceUzs)})
              </span>
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11 px-2 text-[11px]"
              onClick={() => setStartingNew(true)}
            >
              Yangi savdo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 px-1.5 text-[11px]"
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

  // 4. Pre-trade / Selected Account Request Case
  if (accountRequest) {
    return (
      <div className="shrink-0 border-b border-border/80 bg-card/90 px-3 py-1.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <button
            type="button"
            aria-label="So‘ralgan akkount tafsilotlari"
            onClick={() => setIsDrawerOpen(true)}
            className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Handshake className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-foreground">
                {isSeller ? 'So‘ralgan akkount' : 'Siz so‘ragan akkount'}
              </span>
              {accountRequest.listing && (
                <span className="block whitespace-nowrap text-xs text-muted-foreground">
                  {formatPriceUZS(accountRequest.listing.price)}
                </span>
              )}
            </div>
          </button>
          <div className="flex shrink-0 items-center gap-1.5">
            {requiresAdminHandoff ? (
              <Button type="button" size="sm" className="min-h-11 px-2.5 text-[11.5px]" onClick={() => setIsDrawerOpen(true)}>
                Adminga murojaat
              </Button>
            ) : isSeller ? (
              <Button
                type="button"
                size="sm"
                className="min-h-11 px-2.5 text-[11.5px]"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowProposeModal(true);
                }}
              >
                Taklif yuborish
              </Button>
            ) : (
              <Badge variant="muted" className="py-0.5 text-[10.5px]">
                Taklif kutilmoqda
              </Badge>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-h-11 min-w-11 px-1.5 text-[11px]"
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

  // 5. Default initial state - subtle prompt to start trade if role is seller
  if (isSeller) {
    return (
      <div className="shrink-0 border-b border-border/80 bg-card/85 px-3 py-1.5 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Handshake className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs text-muted-foreground">
              Xaridor bilan xavfsiz savdoni boshlang
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 px-2.5 text-xs"
            onClick={() => setShowProposeModal(true)}
          >
            Taklif yuborish
          </Button>
        </div>
      </div>
    );
  }

  return null;
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
              {trade.kind === 'SWAP' ? 'Akkount almashish' : formatPriceUZS(trade.priceUzs)}
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
              {nextStep}
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-foreground">
              {actionRequired ? 'Davom etish' : 'Batafsil'}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
