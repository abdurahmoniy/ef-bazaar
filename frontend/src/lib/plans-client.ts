'use client';

import { purchaseErrorFrom, type MyPlan, type PlanCode, type PlanPeriod, type PurchaseError } from './plans';

export class PlanPurchaseError extends Error {
  constructor(public readonly detail: PurchaseError) {
    super(detail.kind === 'price_changed' ? 'Tarif narxi o‘zgardi' : detail.message);
  }
}

export async function purchasePlan(req: {
  planCode: PlanCode;
  period: PlanPeriod;
  expectedPriceTiyin: number;
  idempotencyKey: string;
}): Promise<MyPlan> {
  const res = await fetch('/api/payment/v1/payments/plans/purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new PlanPurchaseError(purchaseErrorFrom(res.status, body));
  }
  return (await res.json()) as MyPlan;
}
