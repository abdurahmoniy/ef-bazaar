import Link from 'next/link';
import { ArrowRight, Clock, Handshake, ShoppingCart, Store } from 'lucide-react';

import { formatListingDate, formatPriceUZS } from '@/lib/marketplace-format';
import {
  isTerminalState,
  TRADE_STATE_LABEL_UZ,
  type TradeResponse,
  type TradeState,
} from '@/lib/trade-types';
import { cn } from '@/lib/utils';

interface ProfileTradesProps {
  trades: TradeResponse[];
}

/**
 * Terminal states get a flat neutral chip; a live trade is the one the user has
 * to act on, so it keeps the accent. SUCCESS is the exception — it is worth
 * reading as a win even though nothing is pending.
 */
function stateChipClass(state: TradeState) {
  if (state === 'SUCCESS') return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400';
  if (state === 'REJECTED' || state === 'ORPHANED') return 'bg-muted text-muted-foreground';
  return 'bg-primary/15 text-primary';
}

export function ProfileTrades({ trades }: ProfileTradesProps) {
  if (trades.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card">
        <Handshake className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <h2 className="mt-2 text-sm font-bold text-foreground">Hali savdo yo&apos;q</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Sotuvchi bilan chatda kelishuv boshlanganda savdo shu yerda ko&apos;rinadi.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {trades.map((trade) => {
        const live = !isTerminalState(trade.state);
        const buying = trade.role === 'BUYER';
        // A trade always starts from a marketplace chat, but chatId is nullable
        // on the DTO — fall back to the trade's own route rather than an
        // "/chats/null" link.
        const href = trade.chatId ? `/chats/${trade.chatId}` : `/chats`;

        return (
          <li key={trade.id}>
            <Link
              href={href}
              className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 shadow-card transition hover:border-primary/40 hover:shadow-card-hover"
            >
              <span
                className={cn(
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full',
                  buying ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground',
                )}
                aria-hidden
              >
                {buying ? (
                  <ShoppingCart className="h-4 w-4" />
                ) : (
                  <Store className="h-4 w-4" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-foreground">
                    {formatPriceUZS(trade.priceUzs)}
                  </span>
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {buying ? 'Sotib olish' : 'Sotish'}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10.5px] font-bold',
                      stateChipClass(trade.state),
                    )}
                  >
                    {TRADE_STATE_LABEL_UZ[trade.state]}
                  </span>
                  {live && trade.stateDeadline && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatListingDate(trade.stateDeadline)}
                    </span>
                  )}
                  <span className="text-[10.5px] text-muted-foreground">
                    {formatListingDate(trade.createdAt)}
                  </span>
                </div>
              </div>

              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
