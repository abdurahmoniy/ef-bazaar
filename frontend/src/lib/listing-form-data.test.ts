import { describe, expect, it } from 'vitest';

import { collectListingFiles, createListingRequestFromForm } from './listing-form-data';

describe('createListingRequestFromForm', () => {
  it('builds a marketplace create payload from form fields', () => {
    const formData = new FormData();
    formData.set('description', 'Strong account with rare players');
    formData.set('valuablePlayers', 'Messi, Neymar\nMbappe');
    formData.set('highestDivisionLevel', '2');
    formData.set('teamStrength', '3150');
    formData.set('androidCoins', '100');
    formData.set('iosCoins', '50');
    formData.set('price', '450000');
    formData.set('hasGooglePlayLink', 'on');
    formData.set('priceNegotiable', 'on');

    expect(createListingRequestFromForm(formData)).toEqual({
      description: 'Strong account with rare players',
      price: 450000,
      priceNegotiable: true,
      attributes: {
        highest_division_level: 2,
        team_strength: 3150,
        android_coins: 100,
        ios_coins: 50,
        has_google_play_link: true,
        valuable_players: ['Messi', 'Neymar', 'Mbappe'],
      },
    });
  });

  it('omits valuable_players when the field is empty', () => {
    const formData = new FormData();
    formData.set('description', 'Solid account no legends');
    formData.set('highestDivisionLevel', '5');
    formData.set('teamStrength', '2800');
    formData.set('androidCoins', '0');
    formData.set('iosCoins', '0');
    formData.set('price', '100000');

    const result = createListingRequestFromForm(formData);
    expect(typeof result).not.toBe('string');
    if (typeof result === 'string') return;
    expect(result.attributes).not.toHaveProperty('valuable_players');
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
