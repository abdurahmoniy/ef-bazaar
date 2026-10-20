import type { PlanCode, PlanPeriod } from './plans';

export interface PlanPriceRow {
  planCode: PlanCode;
  period: PlanPeriod;
  priceTiyin: number;
  updatedBy: string | null;
  updatedAt: string;
}

export interface PlanEntitlementRow {
  planCode: PlanCode;
  key: string;
  /** null = unlimited. */
  value: string | null;
  updatedBy: string | null;
  updatedAt: string;
}

export type SlotDraft = { unlimited: boolean; count: string };

export function toEntitlementValue(d: SlotDraft): string | null {
  if (d.unlimited) return null;
  const s = d.count.trim();
  if (!/^\d+$/.test(s)) throw new Error('Butun son kiriting');
  return String(Number.parseInt(s, 10));
}

export function fromEntitlementValue(v: string | null): SlotDraft {
  return v === null ? { unlimited: true, count: '' } : { unlimited: false, count: v };
}

/** Detects a lower ceiling, including unlimited → finite; the entitlement key decides its effect. */
export function isReduction(before: string | null, after: string | null): boolean {
  if (after === null) return false;
  if (before === null) return true;
  return Number(after) < Number(before);
}

export function parseSomInput(raw: string): number {
  const s = raw.replace(/[\s  ]/g, '');
  if (!/^\d+$/.test(s)) throw new Error('Narxni so‘mda butun son bilan kiriting');
  const som = Number.parseInt(s, 10);
  if (som <= 0) throw new Error('Narx 0 dan katta bo‘lishi kerak');
  return som * 100;
}

const BASE = '/api/payment/v1/admin/plans';

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || body.message || `So'rov bajarilmadi (${res.status})`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const updatePlanPrices = (
  prices: { planCode: PlanCode; period: PlanPeriod; priceTiyin: number }[],
) => call<PlanPriceRow[]>('/prices', { method: 'PUT', body: JSON.stringify({ prices }) });

export const updatePlanEntitlements = (
  entitlements: { planCode: PlanCode; key: string; value: string | null }[],
) => call<PlanEntitlementRow[]>('/entitlements', { method: 'PUT', body: JSON.stringify({ entitlements }) });

export const assignPlan = (req: { userId: string; planCode: PlanCode; expiresAt: string | null; source: string }) =>
  call<unknown>('/assign', { method: 'POST', body: JSON.stringify(req) });
