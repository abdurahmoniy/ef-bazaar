import { describe, expect, it } from 'vitest';

import { createListingRequestFromForm } from './listing-form-data';

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
      valuablePlayers: ['Messi', 'Neymar', 'Mbappe'],
      hasGooglePlayLink: true,
      highestDivisionLevel: 2,
      androidCoins: 100,
      iosCoins: 50,
      teamStrength: 3150,
      price: 450000,
      priceNegotiable: true,
    });
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
