import 'server-only';

import { apiFetch, ApiException } from './api';
import type { UserAccountResponse } from './accounts-types';

const ACCOUNTS_PATH = '/marketplace/v1/accounts';

/**
 * Profil sahifasi uchun ro'yxat. Xato bo'lsa bo'sh ro'yxat — bitta
 * yiqilgan so'rov butun profilni ochilmaydigan qilmasligi kerak
 * ({@code getMyListings} bilan bir xil qoida).
 */
export async function getMyAccountsServer(): Promise<UserAccountResponse[]> {
  try {
    return await apiFetch<UserAccountResponse[]>(ACCOUNTS_PATH);
  } catch (error) {
    if (error instanceof ApiException) {
      console.error(`[accounts-server] ${ACCOUNTS_PATH} → ${error.status}: ${error.message}`);
      return [];
    }
    throw error;
  }
}

/** Tahrirlash sahifasi uchun. Topilmasa null — sahifa notFound() qiladi. */
export async function getAccountServer(id: string): Promise<UserAccountResponse | null> {
  try {
    return await apiFetch<UserAccountResponse>(`${ACCOUNTS_PATH}/${encodeURIComponent(id)}`);
  } catch (error) {
    if (error instanceof ApiException) {
      return null;
    }
    throw error;
  }
}
