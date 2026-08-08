'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, ApiException } from '@/lib/api';
import type {
  TradeAdminApplicationCreateRequest,
  TradeAdminApplicationResponse,
} from '@/lib/trade-admin-applications';

export type TradeAdminApplicationActionResult =
  | { ok: true; data: TradeAdminApplicationResponse }
  | { ok: false; error: string; code?: string };

export async function submitTradeAdminApplicationAction(
  payload: TradeAdminApplicationCreateRequest,
): Promise<TradeAdminApplicationActionResult> {
  try {
    const response = await apiFetch<TradeAdminApplicationResponse>(
      '/auth/v1/trade-admin-applications',
      { method: 'POST', body: payload },
    );
    revalidatePath('/profile');
    revalidatePath('/admin/trade-admin-applications');
    return { ok: true, data: response };
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, error: error.message, code: error.code };
    }
    return { ok: false, error: "Auth-service bilan bog'lanib bo'lmadi" };
  }
}
