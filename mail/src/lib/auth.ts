import 'server-only';

import { apiFetch, ApiException } from './api';

/**
 * Minimal slice of auth-service's user payload — the mail app only ever needs
 * "is there a valid session", so we don't mirror the full User shape from the
 * marketplace frontend.
 */
export interface User {
  id: string;
  username: string | null;
}

export async function getMe(): Promise<User | null> {
  try {
    return await apiFetch<User>('/auth/v1/users/me');
  } catch (e) {
    if (e instanceof ApiException && (e.status === 401 || e.status === 403)) {
      return null;
    }
    throw e;
  }
}
