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
import { createListingRequestFromForm } from '@/lib/listing-form-data';

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
  const request = createListingRequestFromForm(formData);
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
