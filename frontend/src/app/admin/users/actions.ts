'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, ApiException } from '@/lib/api';

export interface AdminUserActionResult {
  ok: boolean;
  error?: string;
  code?: string;
}

async function run(action: () => Promise<unknown>): Promise<AdminUserActionResult> {
  try {
    await action();
  } catch (e) {
    if (e instanceof ApiException) {
      return { ok: false, error: e.message, code: e.code };
    }
    return { ok: false, error: "Auth-service bilan bog'lanib bo'lmadi" };
  }
  revalidatePath('/admin/users');
  return { ok: true };
}

export async function setUserRoleAction(
  userId: string,
  role: 'USER' | 'ADMIN',
): Promise<AdminUserActionResult> {
  return run(() =>
    apiFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}/role`, {
      method: 'PUT',
      body: { role },
    }),
  );
}

export async function deleteUserAction(userId: string): Promise<AdminUserActionResult> {
  return run(() =>
    apiFetch(`/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),
  );
}
