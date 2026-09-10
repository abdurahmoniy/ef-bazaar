'use client';

import { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Handshake,
  History,
  KeyRound,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UserCog,
  X,
} from 'lucide-react';

import { CountdownText } from '@/components/trade-admin/countdown-text';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatPriceUZS } from '@/lib/marketplace-format';
import { isHumanProposal, isHumanTrade } from '@/lib/trade-human';
import {
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
    trades,
    activeTrade,
    lastFinished,
    proposal,
    startingNew,
    setStartingNew,
    accountRequest,
    isSeller,
    role,
    setShowAcceptModal,
    setShowProposeModal,
    setIsDrawerOpen,
    isDrawerOpen,
    scrollToTradePanel,
  } = useTradeContext();

  // 1. Pending Proposal Case (can render immediately even on SSR if initialPendingProposal is provided)
  if (proposal) {
    const isHuman = isHumanProposal(proposal);
    return (
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 border-b border-primary/20 bg-primary/10 px-3 py-2 backdrop-blur-md transition-all md:top-[3.5rem]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsDrawerOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIsDrawerOpen(true);
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/20 text-primary">
              <Handshake className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-xs font-bold text-foreground">
                  {isSwap(proposal.kind)
                    ? `Almashish (${TRADE_KIND_LABEL_UZ[proposal.kind ?? 'SWAP']})`
                    : 'Savdo taklifi'}
                </span>
                <span className="shrink-0 text-xs font-black text-primary">
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
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            {!isSeller && (
              <Button
                type="button"
                size="sm"
                className="h-8 px-2.5 text-xs font-semibold shadow-sm"
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
              className="h-8 px-2 text-xs"
              onClick={() => setIsDrawerOpen(true)}
              aria-label="Savdo tafsilotlari"
            >
              Batafsil
              <ChevronDown className="ml-1 h-3.5 w-3.5" />
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
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 border-b border-border bg-muted/70 px-3 py-1.5 backdrop-blur-md md:top-[3.5rem]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsDrawerOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIsDrawerOpen(true);
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
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
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => setStartingNew(true)}
            >
              Yangi savdo
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-1.5 text-[11px]"
              onClick={() => setIsDrawerOpen(true)}
            >
              Ko'rish
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Pre-trade / Selected Account Request Case
  if (accountRequest) {
    return (
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 border-b border-border/80 bg-card/90 px-3 py-1.5 backdrop-blur-md md:top-[3.5rem]">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => setIsDrawerOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setIsDrawerOpen(true);
            }}
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
          >
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
              <Handshake className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <span className="truncate text-xs font-semibold text-foreground">
                {isSeller ? 'So‘ralgan akkount' : 'Siz so‘ragan akkount'}
              </span>
              {accountRequest.listing && (
                <span className="ml-1.5 text-xs font-bold text-primary">
                  {formatPriceUZS(accountRequest.listing.price)}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {requiresAdminHandoff ? (
              <Button type="button" size="sm" className="h-7 px-2.5 text-[11.5px]" onClick={() => setIsDrawerOpen(true)}>
                Adminga murojaat
              </Button>
            ) : isSeller ? (
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-[11.5px]"
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
              className="h-7 px-1.5 text-[11px]"
              onClick={() => setIsDrawerOpen(true)}
            >
              Ko'rish
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Default initial state - subtle prompt to start trade if role is seller
  if (isSeller) {
    return (
      <div className="sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 border-b border-border/80 bg-card/85 px-3 py-1.5 backdrop-blur-md md:top-[3.5rem]">
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
            className="h-7 px-2.5 text-xs"
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
  const { viewerId, setIsDrawerOpen } = useTradeContext();
  const isHuman = isHumanTrade(trade);
  const isSeller = trade.sellerId === viewerId;
  const isBuyer = trade.buyerId === viewerId;
  const shortId = trade.id.slice(0, 8);
  const terminal = isTerminalState(trade.state);

  const quickActionText = useMemo(() => {
    switch (trade.state) {
      case 'WAITING_EMAIL_CHANGE':
        return isSeller ? "Email o'zgartirish" : 'Sotuvchini kuting';
      case 'VERIFYING_KONAMI_LINK':
        return isSeller ? 'Konami tekshiruv' : 'Tekshirilmoqda';
      case 'WAITING_PASSWORD':
        return isSeller ? 'Parol kiritish' : 'Parol kutilmoqda';
      case 'WAITING_BUYER_VERIFY':
        return isBuyer ? 'Parolni ochish' : 'Xaridorni kuting';
      case 'WAITING_ADMIN':
        return isSeller ? 'Admin tanlash' : 'Admin kutilmoqda';
      case 'WAITING_CLOSE_CONFIRM':
        return 'Tasdiqlash';
      case 'SUCCESS':
        return 'Muvaffaqiyatli';
      default:
        return 'Batafsil';
    }
  }, [trade.state, isSeller, isBuyer]);

  const highlightAction =
    (trade.state === 'WAITING_EMAIL_CHANGE' && isSeller) ||
    (trade.state === 'VERIFYING_KONAMI_LINK' && isSeller) ||
    (trade.state === 'WAITING_PASSWORD' && isSeller) ||
    (trade.state === 'WAITING_BUYER_VERIFY' && isBuyer) ||
    (trade.state === 'WAITING_CLOSE_CONFIRM');

  return (
    <div
      className={cn(
        'sticky top-[calc(env(safe-area-inset-top)+3.5rem)] z-20 border-b backdrop-blur-md transition-all md:top-[3.5rem]',
        highlightAction
          ? 'border-primary/30 bg-primary/10 shadow-sm'
          : 'border-border/80 bg-card/95',
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-3 py-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsDrawerOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') setIsDrawerOpen(true);
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2"
        >
          <span
            className={cn(
              'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs',
              isHuman
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                : 'bg-primary/20 text-primary',
            )}
          >
            {isHuman ? <UserCog className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-bold text-foreground">
                Savdo · {shortId}
              </span>
              <span className="shrink-0 text-xs font-black text-primary">
                {formatPriceUZS(trade.priceUzs)}
              </span>
              <Badge
                variant={terminal ? 'muted' : 'verified'}
                className="hidden py-0 text-[10px] sm:inline-flex"
              >
                {TRADE_STATE_LABEL_UZ[trade.state]}
              </Badge>
            </div>
            <div className="flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
              <span className="truncate sm:hidden">{TRADE_STATE_LABEL_UZ[trade.state]}</span>
              {trade.stateDeadline && !terminal && (
                <span className="flex items-center gap-0.5 text-primary">
                  <Clock className="h-3 w-3" />
                  <CountdownText until={trade.stateDeadline} prefix="Qoldi: " />
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant={highlightAction ? 'default' : 'outline'}
            className={cn(
              'h-8 px-2.5 text-xs font-semibold transition',
              highlightAction && 'shadow-sm animate-pulse',
            )}
            onClick={() => setIsDrawerOpen(true)}
          >
            {quickActionText}
            <ChevronDown className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
