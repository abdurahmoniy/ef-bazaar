import { describe, expect, it } from 'vitest';

import {
  collectListingFiles,
  createListingRequestFromForm,
  SEEDED_LISTING_ATTRIBUTE_DEFINITIONS,
} from './listing-form-data';
import type { ListingAttributeDefinition } from './marketplace-types';

describe('createListingRequestFromForm', () => {
  it('allows up to thirty searchable valuable cards', () => {
    expect(SEEDED_LISTING_ATTRIBUTE_DEFINITIONS.find((definition) =>
      definition.key === 'valuable_players')?.constraints?.max_items).toBe(30);
  });

  const definitions = [
    {
      key: 'highest_division_level',
      labelUz: 'Eng yuqori division',
      type: 'INT',
      required: true,
      constraints: { min: 1, max: 9 },
    },
    {
      key: 'team_strength',
      labelUz: 'Team Strength',
      type: 'INT',
      required: true,
      constraints: { min: 0 },
    },
    {
      key: 'valuable_players',
      labelUz: "Yulduz o'yinchilar",
      type: 'LIST_STRING',
      required: false,
      constraints: { item_max_length: 64 },
    },
    {
      key: 'platform',
      labelUz: 'Platforma',
      type: 'ENUM',
      required: true,
      constraints: { options: ['Android', 'iOS'] },
    },
    {
      key: 'account_value',
      labelUz: 'Account value',
      type: 'DECIMAL',
      required: false,
      constraints: { min: 0 },
    },
    {
      key: 'has_google_play_link',
      labelUz: 'Google Play link mavjud',
      type: 'BOOLEAN',
      required: false,
      constraints: {},
    },
  ] satisfies readonly ListingAttributeDefinition[];

  it('builds a marketplace create payload from dynamic attribute fields', () => {
    const formData = new FormData();
    formData.set('description', 'Strong account with rare players');
    formData.set('attr.highest_division_level', '2');
    formData.set('attr.team_strength', '3150');
    formData.set('attr.valuable_players', 'Messi, Neymar\nMbappe');
    formData.set('attr.platform', 'Android');
    formData.set('attr.account_value', '123.45');
    formData.set('attr.has_google_play_link', 'on');
    formData.set('price', '450000');
    formData.set('priceNegotiable', 'on');

    expect(createListingRequestFromForm(formData, definitions)).toEqual({
      description: 'Strong account with rare players',
      price: 450000,
      priceNegotiable: true,
      attributes: {
        highest_division_level: 2,
        team_strength: 3150,
        valuable_players: ['Messi', 'Neymar', 'Mbappe'],
        platform: 'Android',
        account_value: 123.45,
        has_google_play_link: true,
      },
    });
  });

  it('validates required dynamic attributes', () => {
    const formData = new FormData();
    formData.set('description', 'Strong account with rare players');
    formData.set('attr.highest_division_level', '2');
    formData.set('price', '450000');

    expect(createListingRequestFromForm(formData, definitions)).toBe(
      "Team Strength maydonini to'ldiring",
    );
  });

  it('builds a marketplace create payload from form fields', () => {
    const formData = new FormData();
    formData.set('description', 'Strong account with rare players');
    formData.set('valuablePlayers', 'Messi, Neymar\nMbappe');
    formData.set('highestDivisionLevel', '2');
    formData.set('teamStrength', '3150');
    formData.set('androidCoins', '100');
    formData.set('iosCoins', '50');
    formData.set('attr.platform', 'MOBILE');
    formData.set('attr.device_transfer_limit', '6');
    formData.set('price', '450000');
    formData.set('hasGooglePlayLink', 'on');
    formData.set('priceNegotiable', 'on');

    expect(createListingRequestFromForm(formData)).toEqual({
      description: 'Strong account with rare players',
      price: 450000,
      priceNegotiable: true,
      attributes: {
        // Seeded definition is ENUM since the 4-tier flip — value stays a string.
        highest_division_level: '2',
        team_strength: 3150,
        android_coins: 100,
        ios_coins: 50,
        platform: 'MOBILE',
        has_google_play_link: true,
        has_game_center_link: false,
        device_transfer_limit: 6,
        valuable_players: ['Messi', 'Neymar', 'Mbappe'],
      },
    });
  });

  it('omits valuable_players when the field is empty', () => {
    const formData = new FormData();
    formData.set('description', 'Solid account no legends');
    formData.set('highestDivisionLevel', '3');
    formData.set('teamStrength', '2800');
    formData.set('androidCoins', '0');
    formData.set('iosCoins', '0');
    formData.set('attr.platform', 'MOBILE');
    formData.set('attr.device_transfer_limit', '10');
    formData.set('price', '100000');

    const result = createListingRequestFromForm(formData);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.attributes).not.toHaveProperty('valuable_players');
  });

  it('defaults android_coins and ios_coins to 0 when fields are omitted or empty', () => {
    const formData = new FormData();
    formData.set('description', 'Solid account with default coins');
    formData.set('highestDivisionLevel', '3');
    formData.set('teamStrength', '2800');
    formData.set('attr.platform', 'MOBILE');
    formData.set('attr.device_transfer_limit', '10');
    formData.set('price', '100000');

    const result = createListingRequestFromForm(formData);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.attributes.android_coins).toBe(0);
    expect(result.attributes.ios_coins).toBe(0);
  });

  it('blocks listings whose device transfer limit is below the sellable floor', () => {
    const formData = new FormData();
    formData.set('description', 'Strong account with rare players');
    formData.set('highestDivisionLevel', '3');
    formData.set('teamStrength', '2800');
    formData.set('attr.platform', 'MOBILE');
    formData.set('attr.device_transfer_limit', '1');
    formData.set('price', '100000');

    const result = createListingRequestFromForm(formData);
    expect(result).toContain('Sotuv uchun kamida 2 ta kerak');
  });

  it('accepts a device transfer limit exactly at the floor', () => {
    const formData = new FormData();
    formData.set('description', 'Strong account with rare players');
    formData.set('highestDivisionLevel', '3');
    formData.set('teamStrength', '2800');
    formData.set('attr.platform', 'MOBILE');
    formData.set('attr.device_transfer_limit', '2');
    formData.set('price', '100000');

    const result = createListingRequestFromForm(formData);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.attributes.device_transfer_limit).toBe(2);
  });

  it('rejects a device transfer limit above the monthly cap', () => {
    const formData = new FormData();
    formData.set('description', 'Strong account with rare players');
    formData.set('highestDivisionLevel', '3');
    formData.set('teamStrength', '2800');
    formData.set('attr.platform', 'MOBILE');
    formData.set('attr.device_transfer_limit', '11');
    formData.set('price', '100000');

    expect(createListingRequestFromForm(formData)).toBe(
      "Qurilma almashtirish limiti 10 dan katta bo'lmasligi kerak",
    );
  });

  it('returns validation messages for invalid listing fields', () => {
    const formData = new FormData();
    formData.set('description', 'short');
    formData.set('highestDivisionLevel', '12');
    formData.set('teamStrength', '1000');
    formData.set('androidCoins', '0');
    formData.set('iosCoins', '0');
    formData.set('price', '100');

    expect(createListingRequestFromForm(formData)).toBe(
      "Tavsif kamida 10 ta belgidan iborat bo'lishi kerak",
    );
  });
});

describe('collectListingFiles', () => {
  it('skips empty file placeholders and keeps real uploads', () => {
    const formData = new FormData();
    formData.append('files', new File([], 'empty.jpg'));
    formData.append('files', new File(['xx'], 'photo1.jpg', { type: 'image/jpeg' }));
    formData.append('files', new File(['yy'], 'photo2.jpg', { type: 'image/jpeg' }));

    const files = collectListingFiles(formData);
    expect(files.map((f) => f.name)).toEqual(['photo1.jpg', 'photo2.jpg']);
  });
});
