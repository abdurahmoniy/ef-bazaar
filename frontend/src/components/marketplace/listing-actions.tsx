'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Flag, Heart, MessageCircle, ShoppingBag } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useTelegramMainButton } from '@/hooks/use-telegram-main-button';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { formatCompactNumber } from '@/lib/marketplace-format';
import { cn } from '@/lib/utils';
import type { ChatResponse, LikeToggleResponse } from '@/lib/marketplace-types';

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
}

export function ListingActions({
  listingId,
  authenticated,
  isOwner = false,
  initialLiked,
  initialLikeCount,
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

  useTelegramMainButton({
    text: !authenticated ? 'Kirish' : isOwner ? "E'lonni tahrirlash" : "Sotuvchi bilan bog'lanish",
    onClick: () => {
      if (!authenticated) return router.push(`/auth/login?from=/marketplace/${listingId}`);
      if (isOwner) return router.push(`/marketplace/${listingId}/edit`);
      handleContact();
    },
    disabled: isPending,
  });

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

      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant={liked ? 'secondary' : 'outline'}
          size="sm"
          className={cn('rounded-lg', liked && 'shadow-inner')}
          disabled={isPending}
          onClick={() => {
            if (!authenticated) return router.push(`/auth/login?from=/marketplace/${listingId}`);
            startTransition(async () => {
              const result = await toggleLike(listingId);
              if (!result.ok) {
                setMessage({ tone: 'error', text: result.error ?? 'Like saqlanmadi' });
                return;
              }
              setLiked(Boolean(result.liked));
              setLikeCount(result.totalLikes ?? likeCount);
            });
          }}
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
            withStatus(() => addToCart(listingId), "Savatga qo'shildi");
          }}
        >
          <ShoppingBag className="h-4 w-4" />
          Savat
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

async function toggleLike(listingId: string): Promise<ActionResult> {
  const result = await marketplaceFetch<LikeToggleResponse>(['v1', 'listings', listingId, 'like'], {
    method: 'POST',
  });

  if (!result.ok) return result;
  return { ok: true, liked: result.data.liked, totalLikes: result.data.totalLikes };
}

async function addToCart(listingId: string): Promise<ActionResult> {
  return marketplaceFetch(['v1', 'cart', listingId], { method: 'POST' });
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
