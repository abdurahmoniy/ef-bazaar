'use client';

import React from 'react';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Handshake,
  ShieldCheck,
  XCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { MessageResponse } from '@/lib/marketplace-types';
import { isSwap, tradeAmountLabel, TRADE_KIND_LABEL_UZ } from '@/lib/trade-swap';
import { useTradeContext } from './trade-context';

interface TradeProposalMessageCardProps {
  message: MessageResponse;
  viewerId: string;
}

export function TradeProposalMessageCard({
  message,
  viewerId,
}: TradeProposalMessageCardProps) {
  const {
    requiresAdminHandoff,
    proposal,
    activeTrade,
    isSeller,
    setShowAcceptModal,
    setIsDrawerOpen,
  } = useTradeContext();

  const isMine = message.senderId === viewerId;
  const rawPrice = Number(message.content);
  const priceUzs = Number.isFinite(rawPrice) && rawPrice > 0 ? rawPrice : proposal?.priceUzs ?? 0;

  // Determine current effective outcome
  const isCurrentActiveProposal = proposal && (!message.proposalId || message.proposalId === proposal.id);
  const outcome = isCurrentActiveProposal
    ? 'PENDING'
    : (message.proposalOutcome ?? 'PENDING');

  const kind = proposal?.kind ?? 'SALE';
  const isSwapMode = isSwap(kind);

  return (
    <div className="my-3 flex w-full justify-center px-2">
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-b from-card via-card to-primary/5 p-4 shadow-sm transition-all hover:border-primary/40 hover:shadow-md dark:border-primary/30 dark:from-card dark:to-primary/10">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Handshake className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-black tracking-wide text-foreground">
                {isSwapMode
                  ? `ALMASHISH (${TRADE_KIND_LABEL_UZ[kind]})`
                  : 'SAVDO TAKLIFI'}
              </p>
              <p className="text-[10.5px] text-muted-foreground">
                {isMine ? 'Siz tomoningizdan yuborilgan' : 'Sizga taklif qilindi'}
              </p>
            </div>
          </div>

          {/* Status Badge */}
          {outcome === 'ACCEPTED' ? (
            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-3 w-3" />
              Qabul qilingan
            </Badge>
          ) : outcome === 'REJECTED' ? (
            <Badge variant="outline" className="gap-1 border-destructive/30 bg-destructive/10 text-[11px] font-semibold text-destructive">
              <XCircle className="h-3 w-3" />
              Rad etilgan
            </Badge>
          ) : outcome === 'EXPIRED' ? (
            <Badge variant="outline" className="gap-1 border-border bg-muted text-[11px] font-semibold text-muted-foreground">
              <Clock className="h-3 w-3" />
              Muddati tugagan
            </Badge>
          ) : (
            <Badge variant="outline" className="gap-1 border-primary/30 bg-primary/10 text-[11px] font-bold text-primary">
              <span className="h-1.5 w-1.5 animate-ping rounded-full bg-primary" />
              Kutilmoqda
            </Badge>
          )}
        </div>

        {/* Amount Section */}
        <div className="my-3 rounded-xl bg-muted/50 p-3 text-center dark:bg-muted/30">
          <p className="text-[11px] font-semibold text-muted-foreground">
            {kind === 'SWAP'
              ? 'Almashish sharti'
              : kind === 'SWAP_SURCHARGE'
                ? 'Doplata'
                : 'Taklif qilingan summa'}
          </p>
          <p className="text-lg font-black tracking-tight text-primary">
            {tradeAmountLabel(kind, priceUzs)}
          </p>
          {isSwapMode && kind === 'SWAP_SURCHARGE' && (
            <p className="mt-0.5 text-[10.5px] text-muted-foreground">Doplata bilan obmen</p>
          )}
        </div>

        {/* Action Controls */}
        <div className="space-y-2 pt-1">
          {outcome === 'PENDING' && isCurrentActiveProposal ? (
            !isSeller ? (
              // Buyer side: Action button to accept or view details
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  className="flex-1 font-bold shadow-sm"
                  onClick={() => requiresAdminHandoff ? setIsDrawerOpen(true) : setShowAcceptModal(true)}
                >
                  <ShieldCheck className="mr-1.5 h-4 w-4" />
                  {requiresAdminHandoff ? 'Adminga murojaat' : 'Qabul qilish'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="font-medium"
                  onClick={() => setIsDrawerOpen(true)}
                >
                  Batafsil
                </Button>
              </div>
            ) : (
              // Seller side: Waiting indicator and details button
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2">
                <span className="text-xs text-muted-foreground">Xaridor javobini kutmoqda...</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs font-semibold text-primary"
                  onClick={() => setIsDrawerOpen(true)}
                >
                  Batafsil
                </Button>
              </div>
            )
          ) : outcome === 'ACCEPTED' || activeTrade ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-full font-semibold"
              onClick={() => setIsDrawerOpen(true)}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Savdo jarayonini ko&apos;rish
            </Button>
          ) : (
            <p className="text-center text-[11px] text-muted-foreground">
              Ushbu taklif yakunlangan.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
