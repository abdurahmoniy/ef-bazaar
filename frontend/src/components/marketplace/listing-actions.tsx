'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Flag, Heart, MessageCircle } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { toggleListingLike } from '@/lib/marketplace-actions';
import { cn } from '@/lib/utils';
import type { ChatResponse } from '@/lib/marketplace-types';

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
  authenticated: boolean;
  isOwner?: boolean;
  initialLiked?: boolean | null;
  initialLikeCount: number;
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
  authenticated,
  isOwner = false,
  initialLiked,
  initialLikeCount,
  variant = 'panel',
  priceLabel,
}: ListingActionsProps) {
  const router = useRouter();
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

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

  function handleContact() {
    if (!authenticated) {
      router.push(`/auth/login?from=/marketplace/${listingId}`);
      return;
    }
    startTransition(async () => {
      setMessage(null);
      const result = await startChat(listingId);
      if (!result.ok) {
        setMessage({ tone: 'error', text: result.error ?? 'Chat ochilmadi' });
        return;
      }
      if (result.chatId) router.push(`/chats/${result.chatId}`);
      else setMessage({ tone: 'ok', text: 'Chat ochildi' });
    });
  }

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
    });
  }

  if (variant === 'bar') {
    return (
      <div className="space-y-1.5">
        {message && (
          <p
            className={cn(
              'text-center text-xs font-semibold',
              message.tone === 'ok' ? 'text-primary' : 'text-destructive',
            )}
          >
            {message.text}
          </p>
        )}
        <div className="flex items-center gap-2.5">
        <div className="min-w-0">
          {priceLabel && (
            <div className="truncate text-lg font-black leading-tight text-[hsl(var(--price))]">
              {priceLabel}
            </div>
          )}
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {isOwner ? "Sizning e'loningiz" : 'Narx'}
          </div>
        </div>

        {isOwner ? (
          <Button asChild size="lg" className="ml-auto flex-1 rounded-lg">
            <Link href={`/marketplace/${listingId}/edit`}>Tahrirlash</Link>
          </Button>
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

  if (isOwner) {
    return (
      <div className="space-y-2">
        <Button asChild size="lg" className="w-full rounded-lg">
          <Link href={`/marketplace/${listingId}/edit`}>Tahrirlash</Link>
        </Button>
        <p className="text-center text-[11px] text-muted-foreground">
          Bu sizning e'loningiz. Xaridorlar bilan aloqa profil orqali.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
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
