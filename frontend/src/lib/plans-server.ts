import 'server-only';

import { apiFetch } from './api';
import type { MyPlan, PlanCatalogItem } from './plans';

/** Same hop as payment-admin-server: internal nginx strips `/payment/`. */
export async function getPlanCatalogSSR(): Promise<PlanCatalogItem[] | null> {
  try {
    return await apiFetch<PlanCatalogItem[]>('/payment/v1/payments/plans');
  } catch {
    return null;
  }
}

export async function getMyPlanSSR(): Promise<MyPlan | null> {
  try {
    return await apiFetch<MyPlan>('/payment/v1/payments/plans/me');
  } catch {
    return null;
  }
}
