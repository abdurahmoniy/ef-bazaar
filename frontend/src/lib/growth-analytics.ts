/** Optional product events. Never include personal data, links, codes or amounts. */
export type GrowthEvent =
  | 'invite_view'
  | 'invite_open'
  | 'invite_impression'
  | 'invite_dismiss'
  | 'invite_share_intent'
  | 'invite_copy_success'
  | 'referral_claimed'
  | 'partnership_view'
  | 'partnership_open'
  | 'partnership_apply'
  | 'partnership_channel_open'
  | 'partnership_price_saved';

export interface GrowthEventDetails {
  placement?: string;
  method?: 'telegram' | 'copy' | 'native';
  state?: string;
}

export function trackGrowth(event: GrowthEvent, details: GrowthEventDetails = {}) {
  if (typeof window === 'undefined') return;
  const analytics = (window as Window & {
    ym?: (id: number, action: string, goal: string, params: GrowthEventDetails) => void;
  }).ym;
  if (typeof analytics !== 'function') return;
  try {
    analytics(110535295, 'reachGoal', event, details);
  } catch {
    // Tracking must never prevent navigation, sharing or application progress.
  }
}
