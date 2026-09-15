/**
 * Kirish shartlari — access-service. Brauzerdan `/api/access/...` proxy orqali.
 */

export type AccessRequirementType = 'TELEGRAM_CHANNEL';

export interface AccessRequirement {
  id: string;
  type: AccessRequirementType;
  title: string | null;
  username: string | null;
  url: string | null;
  photoFileId: string | null;
  createdAt: string;
}

/** auth-service shu kod bilan 403 qaytaradi — frontend shartlar ekranini ochadi. */
export const ACCESS_REQUIREMENTS_UNMET = 'ACCESS_REQUIREMENTS_UNMET';

export const ACCESS_REQUIRED_PATH = '/access-required';

export function accessRequiredHref(from?: string): string {
  if (!from) return ACCESS_REQUIRED_PATH;
  return `${ACCESS_REQUIRED_PATH}?${new URLSearchParams({ from }).toString()}`;
}

/** Kanal avatari bot proksisi orqali — Telegram fayl URL'i tokenni oshkor qiladi. */
export function requirementPhotoUrl(requirement: Pick<AccessRequirement, 'photoFileId'>): string | null {
  return requirement.photoFileId ? `/bot/photo/${encodeURIComponent(requirement.photoFileId)}` : null;
}

export class AccessApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Xatolik (${response.status})`;
    let code: string | undefined;
    try {
      const payload = await response.json();
      message = payload?.message || payload?.error || message;
      code = payload?.code;
    } catch {
      // javob JSON emas — umumiy xabar qoladi
    }
    throw new AccessApiError(message, code);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}

export async function getAdminAccessRequirements(): Promise<AccessRequirement[]> {
  return json(
    await fetch('/api/access/v1/admin/access-requirements', {
      headers: { Accept: 'application/json' },
      credentials: 'include',
      cache: 'no-store',
    }),
  );
}

export async function addTelegramChannelRequirement(username: string): Promise<AccessRequirement> {
  return json(
    await fetch('/api/access/v1/admin/access-requirements/telegram-channels', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username }),
    }),
  );
}

export async function deleteAccessRequirement(id: string): Promise<void> {
  return json(
    await fetch(`/api/access/v1/admin/access-requirements/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    }),
  );
}
