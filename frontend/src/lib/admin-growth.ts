import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';

export interface SignupSummary {
  days: number;
  total: number;
  inPeriod: number;
  daily: { date: string; count: number }[];
}

export interface ChannelSummary {
  /** Rasmiy kanal sozlanmagan bo'lsa nollar "hech kim chiqmadi" degani emas. */
  configured: boolean;
  days: number;
  joins: number;
  leaves: number;
  daily: { date: string; joins: number; leaves: number }[];
}

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Xatolik (${response.status})`);
  return response.json();
}

export async function fetchSignups(days: number): Promise<SignupSummary> {
  return json(await fetch(`/api/auth/v1/admin/users/signups?days=${days}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  }));
}

export async function fetchChannelSummary(days: number): Promise<ChannelSummary> {
  return json(await fetch(`${buildMarketplaceApiPath(['v1', 'admin', 'channel-members', 'summary'])}?days=${days}`, {
    headers: { Accept: 'application/json' },
    credentials: 'include',
  }));
}

/**
 * Ustun balandligi eng gavjum kunga nisbatan. Nol bo'lmagan kun hech qachon
 * ko'rinmay qolmaydi (kamida 4px) — "bir kishi keldi" bilan "hech kim" farqlanadi.
 */
export function barHeights(values: number[], max: number): number[] {
  const peak = Math.max(0, ...values);
  if (peak === 0) return values.map(() => 0);
  return values.map((v) => (v === 0 ? 0 : Math.max(4, Math.round((v / peak) * max))));
}

export function netLabel(joins: number, leaves: number): string {
  const net = joins - leaves;
  if (net > 0) return `+${net}`;
  if (net < 0) return `−${Math.abs(net)}`;
  return '0';
}
