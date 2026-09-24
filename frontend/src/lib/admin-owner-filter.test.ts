import { describe, expect, it } from 'vitest';

import { ownerLabel, resolveOwnerFilter } from './admin-owner-filter';
import type { User } from './types';

function user(overrides: Partial<User>): User {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    displayName: 'Ali Valiyev',
    telegramLinked: true,
    googleLinked: false,
    ...overrides,
  } as User;
}

describe('resolveOwnerFilter', () => {
  it('qidiruvsiz butun katalogni qoldiradi', () => {
    expect(resolveOwnerFilter(undefined, undefined, [])).toEqual({ mode: 'none' });
    expect(resolveOwnerFilter(undefined, '   ', [])).toEqual({ mode: 'none' });
  });

  it('bitta odam topilsa darhol suzadi', () => {
    // Ko'p holatda username aniq bitta odamni beradi — adminni yana bir
    // marta bosishga majburlash ortiqcha.
    const found = user({ telegramUsername: 'gen1us_07' });
    expect(resolveOwnerFilter(undefined, 'gen1us', [found])).toEqual({
      mode: 'single', ownerId: found.id, label: '@gen1us_07',
    });
  });

  it('bir nechta mos kelsa tanlash kerak', () => {
    // O'zi tanlasin: "birinchisini olamiz" degan qoida boshqa odamning
    // e'lonlarini ko'rsatib qo'yardi.
    const a = user({ id: '11111111-1111-1111-1111-111111111111' });
    const b = user({ id: '22222222-2222-2222-2222-222222222222' });
    expect(resolveOwnerFilter(undefined, 'ali', [a, b])).toEqual({
      mode: 'choose', candidates: [a, b],
    });
  });

  it('hech kim topilmasa buni aytadi', () => {
    // Bo'sh katalog ko'rsatish "e'loni yo'q" degan taassurot qoldirardi,
    // aslida esa bunday foydalanuvchining o'zi yo'q.
    expect(resolveOwnerFilter(undefined, 'yoq-odam', [])).toEqual({
      mode: 'missing', query: 'yoq-odam',
    });
  });

  it('tanlangan id qidiruv matnidan ustun turadi', () => {
    const chosen = user({ id: '33333333-3333-3333-3333-333333333333', telegramUsername: 'seller' });
    expect(resolveOwnerFilter(chosen.id, 'ali', [chosen])).toEqual({
      mode: 'single', ownerId: chosen.id, label: '@seller',
    });
  });

  it('id ro‘yxatda bo‘lmasa ham suzgich ishlaydi', () => {
    const id = '44444444-4444-4444-4444-444444444444';
    expect(resolveOwnerFilter(id, undefined, [])).toEqual({
      mode: 'single', ownerId: id, label: id,
    });
  });

  it('id shakliga tushmasa e’tiborsiz qoladi', () => {
    // Havolani qo'lda o'zgartirgan odam serverga axlat yubormasin.
    expect(resolveOwnerFilter('../admin', undefined, [])).toEqual({ mode: 'none' });
  });
});

describe('ownerLabel', () => {
  it('username bor bo‘lsa o‘shani, @ bilan', () => {
    expect(ownerLabel(user({ telegramUsername: 'gen1us_07' }))).toBe('@gen1us_07');
    expect(ownerLabel(user({ telegramUsername: '@gen1us_07' }))).toBe('@gen1us_07');
  });

  it('username yo‘q bo‘lsa ismini', () => {
    expect(ownerLabel(user({ telegramUsername: null }))).toBe('Ali Valiyev');
  });
});
