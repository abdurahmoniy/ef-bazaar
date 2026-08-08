'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, ApiException } from '@/lib/api';
import type { TradeAdminApplicationResponse } from '@/lib/trade-admin-applications';

export type AdminTradeAdminApplicationActionResult =
  | { ok: true; data: TradeAdminApplicationResponse }
  | { ok: false; error: string; code?: string };

async function decide(
  id: string,
  decision: 'approve' | 'reject',
  note?: string,
): Promise<AdminTradeAdminApplicationActionResult> {
  try {
    const response = await apiFetch<TradeAdminApplicationResponse>(
      `/auth/v1/admin/trade-admin-applications/${encodeURIComponent(id)}/${decision}`,
      {
        method: 'POST',
        body: { note: note?.trim() || undefined },
      },
    );
    revalidatePath('/admin/trade-admin-applications');
    revalidatePath('/admin/users');
    return { ok: true, data: response };
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, error: error.message, code: error.code };
    }
    return { ok: false, error: "Auth-service bilan bog'lanib bo'lmadi" };
  }
}

export async function approveTradeAdminApplicationAction(id: string, note?: string) {
  return decide(id, 'approve', note);
}

export async function rejectTradeAdminApplicationAction(id: string, note?: string) {
  return decide(id, 'reject', note);
}
