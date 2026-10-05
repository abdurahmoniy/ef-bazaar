import type { UserAccountResponse } from './accounts-types';
import { SEEDED_LISTING_ATTRIBUTE_DEFINITIONS } from './listing-form-data';
import { isListingAttributeApplicable, isMobileListingPlatform } from './listing-platform-attributes';

/** Draft and trade-created accounts may not yet have the required listing details. */
export function accountDetailsIncomplete(account: UserAccountResponse): boolean {
  if ((account.description?.trim().length ?? 0) < 10) return true;
  return SEEDED_LISTING_ATTRIBUTE_DEFINITIONS.some((definition) => {
    if (!definition.required || definition.active === false
      || !isListingAttributeApplicable(definition.key, account.attributes.platform)
      || (definition.key === 'device_transfer_limit' && !isMobileListingPlatform(account.attributes.platform))) return false;
    const value = account.attributes[definition.key];
    return value == null || (typeof value === 'string' && !value.trim());
  });
}
