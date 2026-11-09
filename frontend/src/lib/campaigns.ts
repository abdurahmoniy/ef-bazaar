import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export type CampaignKind = 'TELEGRAM_GROUP' | 'SOCIAL' | 'FRIENDS' | 'OFFLINE' | 'OTHER';

export const CAMPAIGN_KIND_LABELS: Record<CampaignKind, string> = {
  TELEGRAM_GROUP: 'Telegram guruh',
  SOCIAL: 'Ijtimoiy tarmoq',
  FRIENDS: 'Tanishlar',
  OFFLINE: 'Offline',
  OTHER: 'Boshqa',
};

export interface CampaignRow {
  id: string;
  code: string;
  name: string;
  kind: CampaignKind;
  createdAt: string;
  archivedAt: string | null;
  clicks: number;
  registrations: number;
  listed: number;
  sold: number;
}

/** Bosilish. Anonim ham yuboriladi — server kirmagan odamni ham sanaydi. */
export async function recordCampaignClick(code: string): Promise<void> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'campaigns', 'click']), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error('Kampaniya bosilishi yozilmadi');
}

/**
 * Ro'yxatdan o'tgandan keyin cookie'dagi kodni yuboradi. Rad etish
 * (`claimed: false`) xato emas; HTTP xatosi esa cookie'ni qayta urinish
 * uchun qoldiradi.
 */
export async function claimCampaign(code: string): Promise<boolean> {
  const response = await fetch(buildMarketplaceApiPath(['v1', 'campaigns', 'claim']), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!response.ok) throw new Error('Kampaniya tasdiqlanmadi');
  const body = await response.json();
  if (typeof body?.claimed !== 'boolean') throw new Error('Kampaniya javobi tushunarsiz');
  return body.claimed;
}

/** Foiz: oldingi bosqichdan keyingisiga o'tganlar. Asos nol bo'lsa chiziqcha. */
export function conversion(part: number, whole: number): string {
  if (!whole) return '—';
  return `${Math.round((part / whole) * 100)}%`;
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Xatolik (${response.status})`);
  return response.json();
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'campaigns']), {
      headers: { Accept: 'application/json' },
      credentials: 'include',
    }),
  );
}

export async function createCampaign(name: string, kind: CampaignKind): Promise<CampaignRow> {
  return json(
    await fetch(buildMarketplaceApiPath(['v1', 'admin', 'campaigns']), {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name, kind }),
    }),
  );
}

export async function archiveCampaign(id: string): Promise<void> {
  const response = await fetch(
    buildMarketplaceApiPath(['v1', 'admin', 'campaigns', id, 'archive']),
    { method: 'POST', credentials: 'include' },
  );
  if (!response.ok) throw new Error(`Xatolik (${response.status})`);
}
