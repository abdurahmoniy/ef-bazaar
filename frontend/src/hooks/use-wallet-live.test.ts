import { describe, expect, it } from 'vitest';

import { walletSocketUrl, walletTopic } from './use-wallet-live';

describe('walletSocketUrl', () => {
  it('upgrades an https origin to wss', () => {
    expect(walletSocketUrl('https://efbazaar.uz')).toBe('wss://efbazaar.uz/ws/payment');
  });

  /** A dev host on plain HTTP must not be handed a wss:// URL it cannot serve. */
  it('uses ws on a plain-http origin', () => {
    expect(walletSocketUrl('http://localhost:3000')).toBe('ws://localhost:3000/ws/payment');
  });

  /**
   * Same origin as the page is the whole auth model: the access_token cookie
   * is scoped to this host, and a socket opened against another one would
   * reach nginx with no identity at all.
   */
  it('keeps the host and port it was given', () => {
    expect(walletSocketUrl('https://efbazaar.uz:8443')).toBe('wss://efbazaar.uz:8443/ws/payment');
  });
});

describe('walletTopic', () => {
  it('names the one destination this user may subscribe to', () => {
    expect(walletTopic('11111111-1111-4111-8111-111111111111'))
      .toBe('/topic/wallet/11111111-1111-4111-8111-111111111111');
  });
});
