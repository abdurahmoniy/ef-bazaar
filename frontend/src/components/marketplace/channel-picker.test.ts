import { describe, expect, it } from 'vitest';

import {
  channelInitial,
  channelPhotoUrl,
  advertisingShortfallSom,
  formatAdvertisingPrice,
  formatSubscribers,
  toggleChannel,
  totalPrice,
  type ChannelCard,
} from '@/lib/partner-channels';

const card = (channelId: string, priceSom: number): ChannelCard => ({
  channelId,
  title: channelId,
  username: null,
  photoFileId: null,
  subscriberCount: 100,
  priceSom,
});

describe('totalPrice', () => {
  it('adds fractional prices in tiyin without floating point drift', () => {
    expect(totalPrice([card('a', 0.1), card('b', 0.2)], ['a', 'b'])).toBe(0.3);
  });
  it('adds up only the selected channels', () => {
    const channels = [card('a', 5000), card('b', 15000), card('c', 1000)];
    expect(totalPrice(channels, ['a', 'b'])).toBe(20000);
  });

  it('is zero when nothing is selected', () => {
    expect(totalPrice([card('a', 5000)], [])).toBe(0);
  });

  it('ignores a selection that is no longer in the list', () => {
    // Missing IDs have no price; the UI passes retained selection snapshots.
    expect(totalPrice([card('a', 5000)], ['a', 'gone'])).toBe(5000);
  });

  it('counts duplicate selected IDs once, matching server billing', () => {
    // Tanlov ro'yxati takrorlansa summa ikki barobar ko'rinardi,
    // server esa bir marta hisoblaydi — ekran serverga zid gapirardi.
    expect(totalPrice([card('a', 5000)], ['a', 'a'])).toBe(5000);
  });
});

describe('advertising amounts', () => {
  it('keeps fractional prices visible without decimals on whole prices', () => {
    expect(formatAdvertisingPrice(0.4)).toBe('0.4 so‘m');
    expect(formatAdvertisingPrice(1234.07)).toBe('1 234.07 so‘m');
    expect(formatAdvertisingPrice(5000)).toBe('5 000 so‘m');
  });
  it('accepts an exactly funded wallet, including fractional totals', () => {
    expect(advertisingShortfallSom(0.1 + 0.2, 30)).toBe(0);
    expect(advertisingShortfallSom(0.07, 7)).toBe(0);
    expect(advertisingShortfallSom(0.31, 30)).toBe(1);
    expect(advertisingShortfallSom(5000, 400000)).toBe(1000);
  });
});

describe('toggleChannel', () => {
  it('adds and removes', () => {
    expect(toggleChannel(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleChannel(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('does not mutate the array it was given', () => {
    const selected = ['a'];
    toggleChannel(selected, 'b');
    expect(selected).toEqual(['a']);
  });
});

describe('channelPhotoUrl', () => {
  it('routes through the same photo proxy listing images use', () => {
    // Ikkinchi mexanizm qurilmadi: u bir xil narsani ikki joyda
    // tuzatishga majbur qilardi.
    expect(channelPhotoUrl({ photoFileId: 'AgACAgIAAxk' }))
      .toBe('https://efbazaar.uz/bot/photo/AgACAgIAAxk');
  });

  it('has no url for a channel with no avatar', () => {
    expect(channelPhotoUrl({ photoFileId: null })).toBeNull();
  });
});

describe('channelInitial', () => {
  it('takes the first letter, upper-cased', () => {
    expect(channelInitial('efootball uz')).toBe('E');
  });

  it('survives a title that is only whitespace', () => {
    // Rasm yo'q va nom bo'sh bo'lsa ham bo'sh doira chizmaymiz.
    expect(channelInitial('   ')).toBe('#');
  });
});

describe('formatSubscribers', () => {
  it('groups thousands', () => {
    expect(formatSubscribers(50239).replace(/\s/g, ' ')).toBe('50 239');
  });
});
