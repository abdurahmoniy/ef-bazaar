'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import { ApiException } from '@/lib/api';
import {
  addToCart,
  createListing,
  removeFromCart,
  startChat,
  toggleListingLike,
} from '@/lib/marketplace';
import { normalizePlayerList } from '@/lib/marketplace-format';
import type { ListingCreateRequest } from '@/lib/marketplace-types';

export interface MarketplaceActionResult {
  ok: boolean;
  error?: string;
  code?: string;
  liked?: boolean;
  totalLikes?: number;
  chatId?: string;
}

export interface ListingFormState extends MarketplaceActionResult {
  listingId?: string;
}

const LOGIN_REQUIRED_MESSAGE = 'Telegram orqali kirish kerak';

function toActionError(error: unknown, fallback: string): MarketplaceActionResult {
  if (error instanceof ApiException) {
    if (error.status === 401 || error.status === 403) {
      return {
        ok: false,
        error: LOGIN_REQUIRED_MESSAGE,
        code: error.code ?? 'UNAUTHORIZED',
      };
    }
    return { ok: false, error: error.message, code: error.code };
  }
  return { ok: false, error: fallback };
}

function textField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(formData: FormData, key: string) {
  const raw = textField(formData, key);
  if (!raw) return Number.NaN;

  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

function createRequestFromForm(formData: FormData): ListingCreateRequest | string {
  const description = textField(formData, 'description');
  const highestDivisionLevel = numberField(formData, 'highestDivisionLevel');
  const androidCoins = numberField(formData, 'androidCoins');
  const iosCoins = numberField(formData, 'iosCoins');
  const teamStrength = numberField(formData, 'teamStrength');
  const price = numberField(formData, 'price');

  if (description.length < 10) return "Tavsif kamida 10 ta belgidan iborat bo'lishi kerak";
  if (!Number.isInteger(highestDivisionLevel) || highestDivisionLevel < 1 || highestDivisionLevel > 9) {
    return "Division 1 dan 9 gacha bo'lishi kerak";
  }
  if (androidCoins < 0 || iosCoins < 0 || teamStrength < 0 || price < 0) {
    return "Raqamli maydonlar manfiy bo'lmasligi kerak";
  }
  if (![androidCoins, iosCoins, teamStrength, price].every(Number.isFinite)) {
    return "Raqamli maydonlarni to'ldiring";
  }

  return {
    description,
    valuablePlayers: normalizePlayerList(textField(formData, 'valuablePlayers')),
    hasGooglePlayLink: formData.get('hasGooglePlayLink') === 'on',
    highestDivisionLevel,
    androidCoins,
    iosCoins,
    teamStrength,
    price,
    priceNegotiable: formData.get('priceNegotiable') === 'on',
  };
}

export async function toggleListingLikeAction(listingId: string): Promise<MarketplaceActionResult> {
  try {
    const result = await toggleListingLike(listingId);
    revalidatePath('/marketplace');
    revalidatePath(`/marketplace/${listingId}`);
    return {
      ok: true,
      liked: result.liked,
      totalLikes: result.totalLikes,
    };
  } catch (error) {
    return toActionError(error, 'Like saqlanmadi');
  }
}

export async function addListingToCartAction(listingId: string): Promise<MarketplaceActionResult> {
  try {
    await addToCart(listingId);
    revalidatePath('/marketplace');
    revalidatePath(`/marketplace/${listingId}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error, "Savatga qo'shilmadi");
  }
}

export async function removeListingFromCartAction(listingId: string): Promise<MarketplaceActionResult> {
  try {
    await removeFromCart(listingId);
    revalidatePath('/marketplace');
    revalidatePath(`/marketplace/${listingId}`);
    return { ok: true };
  } catch (error) {
    return toActionError(error, 'Savatdan olib tashlanmadi');
  }
}

export async function startListingChatAction(listingId: string): Promise<MarketplaceActionResult> {
  try {
    const chat = await startChat(listingId);
    return { ok: true, chatId: chat.id };
  } catch (error) {
    return toActionError(error, 'Chat ochilmadi');
  }
}

export async function createListingAction(
  _previousState: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  const request = createRequestFromForm(formData);
  if (typeof request === 'string') return { ok: false, error: request };

  let listingId: string;
  try {
    const listing = await createListing(request);
    listingId = listing.id;
  } catch (error) {
    return toActionError(error, "E'lon yaratilmadi");
  }

  revalidatePath('/marketplace');
  redirect(`/marketplace/${listingId}`);
}
