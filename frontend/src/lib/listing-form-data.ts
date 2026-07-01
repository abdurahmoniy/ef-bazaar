import { normalizePlayerList } from './marketplace-format';
import type { ListingAttributes, ListingCreateRequest } from './marketplace-types';

function textField(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function numberField(formData: FormData, key: string) {
  const raw = textField(formData, key);
  if (!raw) return Number.NaN;

  const value = Number(raw);
  return Number.isFinite(value) ? value : Number.NaN;
}

/**
 * Builds a {@link ListingCreateRequest} from the create-form fields. Attribute
 * keys are snake_case to match the backend AttributeDefinition seed (see
 * V5 migration).
 */
export function createListingRequestFromForm(formData: FormData): ListingCreateRequest | string {
  const description = textField(formData, 'description');
  const highestDivisionLevel = numberField(formData, 'highestDivisionLevel');
  const androidCoins = numberField(formData, 'androidCoins');
  const iosCoins = numberField(formData, 'iosCoins');
  const teamStrength = numberField(formData, 'teamStrength');
  const price = numberField(formData, 'price');

  if (description.length < 10) return "Tavsif kamida 10 ta belgidan iborat bo'lishi kerak";
  if (!Number.isInteger(highestDivisionLevel) || highestDivisionLevel < 1 || highestDivisionLevel > 9) {
    return "Division 1 dan 9 gacha bo'lishi kerak";
  }
  if (androidCoins < 0 || iosCoins < 0 || teamStrength < 0 || price < 0) {
    return "Raqamli maydonlar manfiy bo'lmasligi kerak";
  }
  if (![androidCoins, iosCoins, teamStrength, price].every(Number.isFinite)) {
    return "Raqamli maydonlarni to'ldiring";
  }

  const attributes: ListingAttributes = {
    highest_division_level: highestDivisionLevel,
    team_strength: teamStrength,
    android_coins: androidCoins,
    ios_coins: iosCoins,
    has_google_play_link: formData.get('hasGooglePlayLink') === 'on',
  };

  const players = normalizePlayerList(textField(formData, 'valuablePlayers'));
  if (players.length > 0) {
    attributes.valuable_players = players;
  }

  return {
    description,
    price,
    priceNegotiable: formData.get('priceNegotiable') === 'on',
    attributes,
  };
}

/**
 * Collects the {@code files} entries from the form. Empty files (0 bytes) are
 * filtered out to sidestep browsers that submit a placeholder even when the
 * input is untouched.
 */
export function collectListingFiles(formData: FormData): File[] {
  return formData
    .getAll('files')
    .filter((entry): entry is File => entry instanceof File && entry.size > 0);
}
