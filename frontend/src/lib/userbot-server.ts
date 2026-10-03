import 'server-only';

import { apiFetch, ApiException } from './api';
import type { UserbotAccount, UserbotFeature } from './userbot-types';

/**
 * userbot-core admin reads through internal nginx. `/userbot/` is stripped
 * there, so `/userbot/v1/accounts` lands on userbot-core's `/api/v1/accounts`.
 *
 * Every read returns `null` on failure rather than throwing: the admin page
 * renders its own message instead of a Next error boundary.
 */
const PREFIX = '/userbot/v1';

function report(path: string, error: unknown): null {
  if (error instanceof ApiException) {
    // Status and code only — never the response body.
    console.error(`[userbot-server] ${path} → ${error.status} ${error.code ?? ''}`);
    return null;
  }
  console.error(`[userbot-server] ${path} → network error`);
  return null;
}

export async function listUserbotAccountsSSR(): Promise<UserbotAccount[] | null> {
  const path = `${PREFIX}/accounts`;
  try {
    return await apiFetch<UserbotAccount[]>(path);
  } catch (error) {
    return report(path, error);
  }
}

export async function listUserbotFeaturesSSR(): Promise<UserbotFeature[] | null> {
  const path = `${PREFIX}/features`;
  try {
    return await apiFetch<UserbotFeature[]>(path);
  } catch (error) {
    return report(path, error);
  }
}
