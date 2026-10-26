'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { CheckCircle2, Flag, Heart, MessageCircle } from 'lucide-react';

import { ListingOwnerActions } from './listing-owner-actions';
import { PriceWatchButton } from '@/components/watch/price-watch-button';
import { Button } from '@/components/ui/button';
import { TelegramRequiredPrompt } from '@/components/auth/telegram-required-prompt';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { markListingSold, relistListing, toggleListingLike } from '@/lib/marketplace-actions';
import { cn } from '@/lib/utils';
import type { ChatResponse, ListingStatus } from '@/lib/marketplace-types';

interface ActionResult {
  ok: boolean;
  error?: string;
  code?: string;
  liked?: boolean;
  totalLikes?: number;
  chatId?: string;
}

interface ListingActionsProps {
  listingId: string;
  listingTitle?: string;
  buyerPreview?: boolean;
  authenticated: boolean;
  telegramLinked?: boolean;
  botUsername?: string;
  isOwner?: boolean;
  initialLiked?: boolean | null;
  initialLikeCount: number;
  status?: ListingStatus;
  /**
   * `panel` — the full stacked block used in the desktop sidebar.
   * `bar` — one-line price + primary CTA for the sticky mobile action bar.
   */
  variant?: 'panel' | 'bar';
  /** Pre-formatted price, shown only by the `bar` variant. */
  priceLabel?: string;
}

export function ListingActions({
  listingId,
  listingTitle = 'eFootball akkount',
  buyerPreview = false,
  authenticated,
  telegramLinked = false,
  botUsername = '',
  isOwner = false,
  initialLiked,
  initialLikeCount,
  status = 'ACTIVE',
  variant = 'panel',
  priceLabel,
}: ListingActionsProps) {
  const router = useRouter();
  const [telegramRequired, setTelegramRequired] = useState(false);
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [currentStatus, setCurrentStatus] = useState<ListingStatus>(status);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setCurrentStatus(status);
  }, [status]);

  useEffect(() => {
    setLiked(Boolean(initialLiked));
    setLikeCount(initialLikeCount);
  }, [listingId, initialLiked, initialLikeCount]);

  function withStatus<T extends ActionResult>(action: () => Promise<T>, okMessage: string) {
    startTransition(async () => {
      setMessage(null);
      const result = await action();
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? "So'rov bajarilmadi" });
        return;
      }
      setMessage({ tone: 'ok', text: okMessage });
    });
  }

  function handleMarkSold() {
    startTransition(async () => {
      setMessage(null);
      let result;
      try {
        result = await markListingSold(listingId);
      } catch {
        setMessage({ tone: 'error', text: 'Tarmoq xatoligi. Qayta urinib ko‘ring.' });
        return;
      }
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.message ?? "E'lonni sotilgan deb belgilab bo'lmadi" });
        return;
      }
      setCurrentStatus('SOLD');
      setMessage({ tone: 'ok', text: "E'lon sotilgan deb belgilandi" });
      router.refresh();
    });
  }

  function handleRelist() {
    startTransition(async () => {
      setMessage(null);
      const result = await relistListing(listingId);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.message });
        return;
      }
      setCurrentStatus(result.data.status);
      setMessage({ tone: 'ok', text: "E'lon qayta sotuvga qo'yildi" });
      router.refresh();
    });
  }

  function handleContact() {
    if (!authenticated) {
      router.push(`/auth/login?from=/marketplace/${listingId}`);
      return;
    }
    if (!telegramLinked) {
      setTelegramRequired(true);
      return;
    }
    startTransition(async () => {
      setMessage(null);
      let result: ActionResult;
      try {
        result = await startChat(listingId);
      } catch {
        setMessage({ tone: 'error', text: "Tarmoq xatoligi. Qayta urinib ko'ring." });
        return;
      }
      if (!result.ok) {
        if (result.code === 'telegram_required') {
          setTelegramRequired(true);
          return;
        }
        setMessage({ tone: 'error', text: result.error ?? 'Chat ochilmadi' });
        return;
      }
      if (result.chatId) router.push(`/chats/${result.chatId}`);
      else setMessage({ tone: 'ok', text: 'Chat ochildi' });
    });
  }

  const telegramPrompt = telegramRequired ? (
    <TelegramRequiredPrompt purpose="contact" botUsername={botUsername} onClose={() => setTelegramRequired(false)} />
  ) : null;

  function handleLike() {
    if (!authenticated) return router.push(`/auth/login?from=/marketplace/${listingId}`);
    startTransition(async () => {
      const result = await toggleListingLike(listingId);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.message });
        return;
      }
      setLiked(result.data.liked);
      setLikeCount(result.data.totalLikes);
      router.refresh();
    });
  }

  if (currentStatus === 'DELETED') {
    return (
      <div className="rounded-lg border border-border bg-muted/60 p-3 text-center">
        <p className="text-sm font-bold text-foreground">Ushbu e&apos;lon o&apos;chirilgan</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Sotuvchi bilan aloqa yopilgan.</p>
      </div>
    );
  }

  if (buyerPreview && isOwner && currentStatus === 'ACTIVE') {
    return <div className="space-y-2">
      {priceLabel && <p className="text-lg font-bold text-[hsl(var(--price))]">{priceLabel}</p>}
      <Button disabled className="min-h-11 w-full"><MessageCircle aria-hidden className="h-4 w-4" />Bog‘lanish</Button>
      <p className="text-xs text-muted-foreground">Xaridor ko‘rinishi · amallar o‘chirilgan</p>
    </div>;
  }

  if (isOwner && !buyerPreview && currentStatus === 'ACTIVE') {
    return <ListingOwnerActions listingId={listingId} title={listingTitle} variant={variant} priceLabel={priceLabel}
      pending={isPending} error={message?.tone === 'error' ? message.text : undefined} onMarkSold={handleMarkSold} />;
  }

  if (variant === 'bar') {
    return (
      <div className="space-y-1.5">
        {telegramPrompt}
        {message && (
          <p
            role={message.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'text-center text-xs font-semibold',
              message.tone === 'ok' ? 'text-primary' : 'text-destructive',
            )}
          >
            {message.text}
          </p>
        )}
        {currentStatus === 'ACTIVE' && !isOwner && <PriceWatchButton listingId={listingId} authenticated={authenticated} compact />}
        <div className="flex items-center gap-2.5">
          <div className="min-w-0">
            {priceLabel && (
              <div
                className={cn(
                  'truncate text-lg font-black leading-tight',
                  currentStatus === 'SOLD' ? 'text-muted-foreground line-through' : 'text-[hsl(var(--price))]',
                )}
              >
                {priceLabel}
              </div>
            )}
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {isOwner ? "Sizning e'loningiz" : 'Narx'}
            </div>
          </div>

          {currentStatus === 'SOLD' && isOwner && !buyerPreview ? (
            <Button
              type="button"
              className="ml-auto h-auto min-h-11 max-w-[60%] whitespace-normal rounded-lg px-3 py-2 text-center"
              disabled={isPending}
              onClick={handleRelist}
            >
              {isPending ? "Sotuvga qo'yilmoqda…" : "Qayta sotuvga qo'yish"}
            </Button>
          ) : currentStatus === 'SOLD' ? (
            <div className="ml-auto flex items-center gap-2">
              <div className="rounded-lg bg-success-soft px-3 py-2 text-xs font-bold text-success">
                Sotilgan
              </div>
            </div>
          ) : (
            <>
              <Button
                type="button"
                variant={liked ? 'secondary' : 'outline'}
                size="icon"
                aria-pressed={liked}
                aria-label={liked ? 'Sevimlilardan olib tashlash' : "Sevimlilarga qo'shish"}
                className="ml-auto h-11 w-11 shrink-0 rounded-lg"
                disabled={isPending}
                onClick={handleLike}
              >
                <Heart className={cn('h-5 w-5', liked && 'fill-current')} />
              </Button>
              <Button
                type="button"
                size="lg"
                className="min-w-0 flex-1 rounded-lg"
                onClick={handleContact}
                disabled={isPending}
              >
                <MessageCircle className="h-4 w-4" />
                <span className="truncate">
                  {authenticated ? "Bog'lanish" : "Kirib bog'lanish"}
                </span>
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (isOwner && !buyerPreview && currentStatus === 'SOLD') {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-success-border bg-success-soft p-3 text-center">
          <div className="flex items-center justify-center gap-1.5 text-sm font-bold text-success">
            <CheckCircle2 className="h-4 w-4" /> Ushbu e&apos;lon sotilgan
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            E&apos;lon sotilganlar qatorida saqlanadi.
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="w-full rounded-lg"
          disabled={isPending}
          onClick={handleRelist}
        >
          {isPending ? "Sotuvga qo'yilmoqda…" : "Qayta sotuvga qo'yish"}
        </Button>
        {message && (
          <p
            role="status"
            className={cn(
              'text-center text-xs font-semibold',
              message.tone === 'ok' ? 'text-primary' : 'text-destructive',
            )}
          >
            {message.text}
          </p>
        )}
      </div>
    );
  }


  if (currentStatus === 'SOLD') {
    return (
      <div className="rounded-lg border border-border bg-muted/60 p-3 text-center">
        <p className="text-sm font-bold text-foreground">Ushbu e&apos;lon sotilgan</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Sotuvchi bilan aloqa yopilgan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {telegramPrompt}
      <Button
        type="button"
        size="lg"
        className="w-full rounded-lg text-base"
        onClick={handleContact}
        disabled={isPending}
      >
        <MessageCircle className="h-4 w-4" />
        {authenticated ? "Sotuvchi bilan bog'lanish" : 'Kirish va bog\'lanish'}
      </Button>

      {!isOwner && <PriceWatchButton listingId={listingId} authenticated={authenticated} />}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant={liked ? 'secondary' : 'outline'}
          size="sm"
          className={cn('rounded-lg', liked && 'shadow-inner')}
          disabled={isPending}
          onClick={handleLike}
        >
          <Heart className={cn('h-4 w-4', liked && 'fill-current')} />
          {formatCompactNumber(likeCount)}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-lg"
          disabled={isPending}
          onClick={() => {
            if (!authenticated) return router.push(`/auth/login?from=/marketplace/${listingId}`);
            withStatus(() => reportListing(listingId), 'Shikoyat yuborildi');
          }}
        >
          <Flag className="h-4 w-4" />
          Shikoyat
        </Button>
      </div>

      {message && (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'text-center text-xs font-semibold',
            message.tone === 'ok' ? 'text-primary' : 'text-destructive',
          )}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}

async function startChat(listingId: string): Promise<ActionResult> {
  const result = await marketplaceFetch<ChatResponse>(['v1', 'chats'], {
    method: 'POST',
    body: JSON.stringify({ listingId }),
  });
  if (!result.ok) return result;
  return { ok: true, chatId: result.data.id };
}

async function reportListing(listingId: string): Promise<ActionResult> {
  return marketplaceFetch(['v1', 'listings', listingId, 'report'], {
    method: 'POST',
    body: JSON.stringify({ reason: 'user_reported' }),
  });
}

async function marketplaceFetch<T = unknown>(path: string[], init: RequestInit = {}) {
  const response = await fetch(buildMarketplaceApiPath(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    credentials: 'include',
  });
  const payload = await readJson(response);

  if (!response.ok) {
    return {
      ok: false as const,
      error:
        response.status === 401 || response.status === 403
          ? 'Kirish talab qilinadi'
          : errorMessageFromPayload(payload, "So'rov bajarilmadi"),
      code: codeFromPayload(payload),
    };
  }

  return { ok: true as const, data: payload as T };
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
  return typeof payload === 'object' && payload !== null;
}

function errorMessageFromPayload(payload: unknown, fallback: string) {
  if (!isRecord(payload)) return fallback;
  if (typeof payload.message === 'string') return payload.message;
  if (typeof payload.error === 'string') return payload.error;
  return fallback;
}

function codeFromPayload(payload: unknown) {
  if (!isRecord(payload)) return undefined;
  return typeof payload.code === 'string' ? payload.code : undefined;
}
