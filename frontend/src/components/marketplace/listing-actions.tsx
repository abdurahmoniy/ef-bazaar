'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { Heart, MessageCircle, ShoppingBag } from 'lucide-react';

import {
  addListingToCartAction,
  startListingChatAction,
  toggleListingLikeAction,
  type MarketplaceActionResult,
} from '@/app/marketplace/actions';
import { Button } from '@/components/ui/button';
import { buildDebugMarketplaceApiPath } from '@/lib/debug-visible-api';
import { formatCompactNumber } from '@/lib/marketplace-format';
import type { ChatResponse, LikeToggleResponse } from '@/lib/marketplace-types';

interface ListingActionsProps {
  listingId: string;
  authenticated: boolean;
  initialLiked?: boolean | null;
  initialLikeCount: number;
  visibleApiDebug?: boolean;
}

export function ListingActions({
  listingId,
  authenticated,
  initialLiked,
  initialLikeCount,
  visibleApiDebug = false,
}: ListingActionsProps) {
  const [liked, setLiked] = useState(Boolean(initialLiked));
  const [likeCount, setLikeCount] = useState(initialLikeCount);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!authenticated) {
    return (
      <div className="rounded-[8px] border border-white/10 bg-white/[0.04] p-3">
        <div className="grid grid-cols-2 gap-2">
          <Button asChild size="sm" className="rounded-[8px]">
            <Link href="/auth/login">Kirish</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-[8px]">
            <Link href="/auth/register">Telegram</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant={liked ? 'default' : 'outline'}
          size="sm"
          className="rounded-[8px]"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setMessage(null);
              const result = visibleApiDebug
                ? await toggleLikeWithDebugApi(listingId)
                : await toggleListingLikeAction(listingId);
              if (!result.ok) {
                setMessage(result.error ?? 'Like saqlanmadi');
                return;
              }
              setLiked(Boolean(result.liked));
              setLikeCount(result.totalLikes ?? likeCount);
            });
          }}
        >
          <Heart className="h-4 w-4" />
          {formatCompactNumber(likeCount)}
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-[8px]"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setMessage(null);
              const result = visibleApiDebug
                ? await addToCartWithDebugApi(listingId)
                : await addListingToCartAction(listingId);
              setMessage(result.ok ? "Savatga qo'shildi" : result.error ?? "Savatga qo'shilmadi");
            });
          }}
        >
          <ShoppingBag className="h-4 w-4" />
          Savat
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-[8px]"
          disabled={isPending}
          onClick={() => {
            startTransition(async () => {
              setMessage(null);
              const result = visibleApiDebug
                ? await startChatWithDebugApi(listingId)
                : await startListingChatAction(listingId);
              setMessage(result.ok ? 'Chat ochildi' : result.error ?? 'Chat ochilmadi');
            });
          }}
        >
          <MessageCircle className="h-4 w-4" />
          Chat
        </Button>
      </div>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  );
}

async function toggleLikeWithDebugApi(listingId: string): Promise<MarketplaceActionResult> {
  const result = await debugMarketplaceFetch<LikeToggleResponse>(
    ['v1', 'listings', listingId, 'like'],
    { method: 'POST' },
  );

  if (!result.ok) return result;
  return {
    ok: true,
    liked: result.data.liked,
    totalLikes: result.data.totalLikes,
  };
}

async function addToCartWithDebugApi(listingId: string): Promise<MarketplaceActionResult> {
  return debugMarketplaceFetch(['v1', 'cart', listingId], { method: 'POST' });
}

async function startChatWithDebugApi(listingId: string): Promise<MarketplaceActionResult> {
  const result = await debugMarketplaceFetch<ChatResponse>(['v1', 'chats'], {
    method: 'POST',
    body: JSON.stringify({ listingId }),
  });

  if (!result.ok) return result;
  return {
    ok: true,
    chatId: result.data.id,
  };
}

async function debugMarketplaceFetch<T = unknown>(path: string[], init: RequestInit = {}) {
  const response = await fetch(buildDebugMarketplaceApiPath(path), {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
    credentials: 'same-origin',
  });
  const payload = await readJson(response);

  if (!response.ok) {
    return {
      ok: false as const,
      error: response.status === 401 || response.status === 403
        ? 'Telegram orqali kirish kerak'
        : errorMessageFromPayload(payload, "So'rov bajarilmadi"),
      code: codeFromPayload(payload),
    };
  }

  return {
    ok: true as const,
    data: payload as T,
  };
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
