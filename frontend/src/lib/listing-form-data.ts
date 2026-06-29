import { normalizePlayerList } from './marketplace-format';
import type { ListingCreateRequest } from './marketplace-types';

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

  return {
    description,
    valuablePlayers: normalizePlayerList(textField(formData, 'valuablePlayers')),
    hasGooglePlayLink: formData.get('hasGooglePlayLink') === 'on',
    highestDivisionLevel,
    androidCoins,
    iosCoins,
    teamStrength,
    price,
    priceNegotiable: formData.get('priceNegotiable') === 'on',
  };
}
