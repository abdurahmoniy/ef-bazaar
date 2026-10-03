/** Userbot account lifecycle status: actively working, revoked by Telegram, or disconnected (network/crash) */
export type UserbotStatus = 'ACTIVE' | 'REVOKED' | 'DISCONNECTED';

/** Telegram userbot account (fake user, proxy for SMS/2FA) managed via userbot-service API */
export interface UserbotAccount {
  id: string;
  firstName: string;
  lastName: string | null;
  username: string | null;
  phoneMasked: string;
  status: UserbotStatus;
  statusReason: string | null;
  source: 'PANEL' | 'IMPORTED';
  connectedBy: string | null;
  connectedAt: string;
  alive: boolean;
  lastHeartbeat: string | null;
  runner: 'core' | 'payment' | null;
  features: string[];
  hasAvatar: boolean;
}

/** Feature entry for bind UI — pairs a feature name with its account assignment */
export interface UserbotFeature {
  feature: string;
  title: string;
  accountId: string | null;
}

/** Login flow response — step in Telegram's phone/code/password sequence */
export type LoginStatus = 'CODE_SENT' | 'PASSWORD_REQUIRED' | 'DONE';

/** Step in two-factor / phone login — identifies where code is sent, request to retry */
export interface LoginStepResponse {
  loginId: string;
  status: LoginStatus;
  codeType?: string;
  timeoutSec?: number;
  hint?: string | null;
  account?: UserbotAccount;
}

/** Error response from userbot-service — named error code, user message, retry hint, feature/field names */
export interface UserbotErrorBody {
  code: string;
  message: string;
  retryAfterSec?: number;
  features?: string;
  fields?: string[];
}
