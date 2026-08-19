'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { CheckCircle2, MessageSquare, Star, User } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  fetchTradeSellerRating,
  postSellerRating,
} from '@/lib/trade-client-api';
import type { SellerRatingResponse } from '@/lib/trade-types';
import { cn } from '@/lib/utils';

interface SellerRatingFormProps {
  tradeId: string;
  isBuyer: boolean;
  className?: string;
  onRated?: (rating: SellerRatingResponse) => void;
}

export function SellerRatingForm({
  tradeId,
  isBuyer,
  className,
  onRated,
}: SellerRatingFormProps) {
  const [rating, setRating] = useState<SellerRatingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [stars, setStars] = useState(5);
  const [hoverStars, setHoverStars] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const starValues = useMemo(() => [1, 2, 3, 4, 5], []);

  useEffect(() => {
    let active = true;
    fetchTradeSellerRating(tradeId).then((res) => {
      if (active) {
        if (res.ok && res.data) {
          setRating(res.data);
        }
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [tradeId]);

  function submitRating() {
    setMessage(null);
    startTransition(async () => {
      const res = await postSellerRating(tradeId, stars, comment);
      if (!res.ok) {
        setMessage({ tone: 'error', text: res.error });
        return;
      }
      setRating(res.data);
      setMessage({ tone: 'ok', text: 'Bahoingiz uchun rahmat!' });
      onRated?.(res.data);
    });
  }

  if (loading) {
    return null;
  }

  // Already rated view
  if (rating) {
    return (
      <div
        className={cn(
          'space-y-2.5 rounded-xl border border-emerald-300/60 bg-emerald-500/10 p-3.5 text-xs text-foreground dark:border-emerald-500/30',
          className,
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 className="h-4 w-4" />
            <span>{isBuyer ? 'Siz sotuvchini baholadingiz' : 'Xaridor bahosi'}</span>
          </div>
          <div className="flex items-center gap-1 text-amber-500">
            {starValues.map((v) => (
              <Star
                key={v}
                className={cn(
                  'h-3.5 w-3.5',
                  v <= rating.stars ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30',
                )}
              />
            ))}
            <span className="ml-1 font-extrabold text-foreground">{rating.stars}/5</span>
          </div>
        </div>

        {rating.comment && (
          <div className="rounded-lg bg-background/70 p-2.5 text-muted-foreground border border-border/40">
            <p className="italic">&ldquo;{rating.comment}&rdquo;</p>
          </div>
        )}
      </div>
    );
  }

  // Not buyer view (seller sees waiting state)
  if (!isBuyer) {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3.5 py-2.5 text-xs text-muted-foreground',
          className,
        )}
      >
        <Star className="h-4 w-4 text-amber-400" />
        <span>Xaridor tomonidan baho berilishi kutilmoqda.</span>
      </div>
    );
  }

  // Interactive rating form for the Buyer
  const activeStars = hoverStars ?? stars;

  return (
    <div
      className={cn(
        'space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs shadow-xs',
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-black text-foreground">Sotuvchini baholang</p>
          <p className="text-[11px] text-muted-foreground">
            Savdo tajribangiz haqida fikr qoldiring
          </p>
        </div>
        <div className="flex items-center gap-1">
          {starValues.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setStars(value)}
              onMouseEnter={() => setHoverStars(value)}
              onMouseLeave={() => setHoverStars(null)}
              className="grid h-8 w-8 place-items-center rounded-lg text-amber-500 transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${value} yulduz`}
            >
              <Star
                className={cn(
                  'h-5 w-5 transition-colors',
                  value <= activeStars
                    ? 'fill-amber-400 text-amber-400'
                    : 'text-muted-foreground/30',
                )}
              />
            </button>
          ))}
        </div>
      </div>

      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        maxLength={500}
        rows={2}
        placeholder="Sotuvchi va hisob o'tkazilishi haqida izoh (ixtiyoriy)..."
        className="resize-none text-xs bg-background"
      />

      {message && (
        <p
          className={cn(
            'text-xs font-semibold',
            message.tone === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
          )}
        >
          {message.text}
        </p>
      )}

      <Button
        type="button"
        size="sm"
        onClick={submitRating}
        disabled={pending}
        className="w-full rounded-lg font-bold sm:w-auto"
      >
        {pending ? 'Yuborilmoqda...' : 'Bahoni yuborish'}
      </Button>
    </div>
  );
}
