import { describe, expect, it } from 'vitest';

import {
  conversionRate,
  formatSom,
  funnelVerdict,
  sortByRevenue,
  type PartnerFunnelRow,
} from '@/lib/admin-partner-analytics';

const row = (over: Partial<PartnerFunnelRow> = {}): PartnerFunnelRow => ({
  channelId: 'a',
  title: 'Kanal',
  subscriberCount: 1000,
  active: true,
  clicks: 0,
  registrations: 0,
  postsOrdered: 0,
  postsDelivered: 0,
  postsRefunded: 0,
  revenueSom: 0,
  ...over,
});

describe('conversionRate', () => {
  it('reads as a percentage of clicks', () => {
    expect(conversionRate({ clicks: 200, postsDelivered: 10 })).toBe('5.0%');
  });

  it('shows a dash rather than dividing by zero', () => {
    // Nol bosishdan foiz hisoblab bo'lmaydi, va 0% kanalni "yomon"
    // deb ko'rsatardi — u aslida sinab ko'rilmagan.
    expect(conversionRate({ clicks: 0, postsDelivered: 0 })).toBe('—');
  });
});

describe('sortByRevenue', () => {
  it('puts the channel that earned most first', () => {
    expect(sortByRevenue([row({ channelId: 'a', revenueSom: 10000 }),
                          row({ channelId: 'b', revenueSom: 90000 })])
      .map((r) => r.channelId)).toEqual(['b', 'a']);
  });

  it('does not mutate the array it was given', () => {
    const rows = [row({ channelId: 'a', revenueSom: 1 }), row({ channelId: 'b', revenueSom: 9 })];
    sortByRevenue(rows);
    expect(rows.map((r) => r.channelId)).toEqual(['a', 'b']);
  });
});

describe('funnelVerdict', () => {
  it('separates a channel nobody advertised in from one nobody clicked', () => {
    expect(funnelVerdict(row({ postsOrdered: 0 }))).toBe("E'lon joylanmagan");
    expect(funnelVerdict(row({ postsOrdered: 3, clicks: 0 }))).toBe('Bosilmagan');
  });

  it('separates a clicked channel whose posts never went out', () => {
    expect(funnelVerdict(row({ postsOrdered: 3, clicks: 200, postsDelivered: 0 })))
      .toBe('Chiqmagan');
  });

  it('says it is working when every stage has moved', () => {
    expect(funnelVerdict(row({ postsOrdered: 3, clicks: 200, postsDelivered: 2 })))
      .toBe('Ishlayapti');
  });
});

describe('formatSom', () => {
  it('shows a dash rather than a zero for a channel that earned nothing', () => {
    expect(formatSom(0)).toBe('—');
  });

  it('groups thousands', () => {
    expect(formatSom(1234567).replace(/\s/g, ' ')).toBe('1 234 567');
  });
});
