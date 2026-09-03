import { describe, expect, it } from 'vitest';

import {
  channelInitial,
  channelPhotoUrl,
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
  it('adds up only the selected channels', () => {
    const channels = [card('a', 5000), card('b', 15000), card('c', 1000)];
    expect(totalPrice(channels, ['a', 'b'])).toBe(20000);
  });

  it('is zero when nothing is selected', () => {
    expect(totalPrice([card('a', 5000)], [])).toBe(0);
  });

  it('ignores a selection that is no longer in the list', () => {
    // Qidiruv o'zgarganda tanlangan kanal ro'yxatdan chiqib ketishi
    // mumkin — jami summa undan qulamasligi kerak.
    expect(totalPrice([card('a', 5000)], ['a', 'gone'])).toBe(5000);
  });

  it('counts a channel picked twice only once per entry', () => {
    // Tanlov ro'yxati takrorlansa summa ikki barobar ko'rinardi,
    // server esa bir marta hisoblaydi — ekran serverga zid gapirardi.
    expect(totalPrice([card('a', 5000)], ['a', 'a'])).toBe(10000);
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
    expect(channelPhotoUrl({ photoFileId: 'AgACAgIAAxk' })).toBe('/bot/photo/AgACAgIAAxk');
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
