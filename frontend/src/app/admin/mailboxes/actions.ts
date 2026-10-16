'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, ApiException } from '@/lib/api';
import type { AdminMailbox, CreateMailboxInput } from '@/lib/mailbox-admin-types';
import type { PageResponse } from '@/lib/marketplace-types';
import type { User } from '@/lib/types';

export interface CreateMailboxResult {
  ok: boolean;
  mailbox?: AdminMailbox;
  error?: string;
  code?: string;
}

const LOCAL_PART_PATTERN = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

/**
 * Registers a mailbox and links it to a user. trade-service answers 202: the
 * row exists (address reserved) but Mailcow provisioning finishes
 * asynchronously in smart-admin-worker, so the list shows it as "kutilmoqda"
 * until the worker's event lands.
 */
export async function createMailboxAction(
  input: CreateMailboxInput,
): Promise<CreateMailboxResult> {
  const localPart = input.localPart.trim().toLowerCase();

  if (localPart.length < 3 || localPart.length > 48 || !LOCAL_PART_PATTERN.test(localPart)) {
    return {
      ok: false,
      error: "Manzil 3-48 ta belgi, faqat kichik harf, raqam, nuqta, tire yoki pastki chiziq",
    };
  }
  if (!input.ownerUserId) {
    return { ok: false, error: 'Foydalanuvchi tanlanmagan' };
  }

  try {
    const mailbox = await apiFetch<AdminMailbox>('/trade/v1/admin/mailboxes', {
      method: 'POST',
      body: { localPart, ownerUserId: input.ownerUserId, ...(input.domain ? { domain: input.domain } : {}) },
    });
    revalidatePath('/admin/mailboxes');
    return { ok: true, mailbox };
  } catch (error) {
    if (error instanceof ApiException) {
      if (error.code === 'domain_not_allowed') {
        return { ok: false, error: 'Bu domen ruxsat etilmagan', code: error.code };
      }
      if (error.status === 409) {
        return { ok: false, error: 'Bu manzil band', code: error.code };
      }
      return { ok: false, error: error.message, code: error.code };
    }
    return { ok: false, error: "Trade-service bilan bog'lanib bo'lmadi" };
  }
}

export interface RevealPasswordResult {
  ok: boolean;
  email?: string;
  password?: string;
  error?: string;
}

/**
 * Fetches a mailbox's current password.
 *
 * <p>Its own request rather than a field on the list, so the password is not
 * sitting in the page source of every mailbox screen and each disclosure is one
 * line in trade-service's log.
 *
 * Reads what is stored rather than what was announced when the mailbox was
 * created: handing a mailbox over at the end of a trade rotates the password,
 * so the one in the Telegram notice stops working at that moment and this is
 * what replaces it.
 */
export async function revealMailboxPasswordAction(
  mailboxId: string,
): Promise<RevealPasswordResult> {
  try {
    const body = await apiFetch<{ email: string; password: string }>(
      `/trade/v1/admin/mailboxes/${encodeURIComponent(mailboxId)}/password`,
    );
    return { ok: true, email: body.email, password: body.password };
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Trade-service bilan bog'lanib bo'lmadi" };
  }
}

export interface DeleteMailboxResult {
  ok: boolean;
  error?: string;
}

/**
 * Clears out a mailbox nobody holds.
 *
 * <p>trade-service refuses anything with an owner or a live trade behind it,
 * and its refusal is the message shown — that mailbox is somebody's account,
 * and the reason matters more than the fact.
 */
export async function deleteMailboxAction(mailboxId: string): Promise<DeleteMailboxResult> {
  try {
    await apiFetch<void>(`/trade/v1/admin/mailboxes/${encodeURIComponent(mailboxId)}`, {
      method: 'DELETE',
    });
    revalidatePath('/admin/mailboxes');
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Trade-service bilan bog'lanib bo'lmadi" };
  }
}

export interface OwnerChangeResult {
  ok: boolean;
  error?: string;
}

async function ownerChange(path: string, body?: unknown): Promise<OwnerChangeResult> {
  try {
    await apiFetch<unknown>(path, { method: 'POST', ...(body ? { body } : {}) });
    revalidatePath('/admin/mailboxes');
    return { ok: true };
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: "Trade-service bilan bog'lanib bo'lmadi" };
  }
}

/**
 * Takes a mailbox away from its owner. trade-service rotates the password and
 * refuses while a trade in progress uses the box — its message is shown as is.
 */
export async function detachMailboxAction(mailboxId: string): Promise<OwnerChangeResult> {
  return ownerChange(`/trade/v1/admin/mailboxes/${encodeURIComponent(mailboxId)}/detach`);
}

/** Hands a mailbox to another user; the password is rotated the same way. */
export async function reassignMailboxAction(
  mailboxId: string,
  ownerUserId: string,
): Promise<OwnerChangeResult> {
  if (!ownerUserId) return { ok: false, error: 'Foydalanuvchi tanlanmagan' };
  return ownerChange(`/trade/v1/admin/mailboxes/${encodeURIComponent(mailboxId)}/reassign`, {
    ownerUserId,
  });
}

export interface MailboxUserOption {
  id: string;
  displayName: string;
  telegramUsername: string | null;
  email: string | null;
}

/**
 * Users matching a name, username or e-mail, for picking the next owner. Any
 * user, not just the newest: the create form's dropdown only lists 50.
 */
export async function searchMailboxUsersAction(query: string): Promise<MailboxUserOption[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const params = new URLSearchParams({ search: q, page: '0', size: '10', sort: 'createdAt,desc' });
  try {
    const page = await apiFetch<PageResponse<User>>(`/auth/v1/admin/users?${params.toString()}`);
    return page.content.map((user) => ({
      id: user.id,
      displayName: user.displayName,
      telegramUsername: user.telegramUsername ?? null,
      email: user.email ?? null,
    }));
  } catch {
    return [];
  }
}
