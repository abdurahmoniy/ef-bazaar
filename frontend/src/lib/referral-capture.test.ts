import { describe, expect, it } from 'vitest';

import {
  inviteLinks,
  readCodeFromSearch,
  readCookieCode,
  REFERRAL_COOKIE,
} from './referral-capture';

describe('readCodeFromSearch', () => {
  it('reads the site link parameter', () => {
    expect(readCodeFromSearch('?ref=ABCD2345')).toBe('ABCD2345');
  });

  it('reads the channel post parameter', () => {
    expect(readCodeFromSearch('?p=ABCD2345')).toBe('ABCD2345');
  });

  it('normalises to upper case', () => {
    expect(readCodeFromSearch('?ref=abcd2345')).toBe('ABCD2345');
  });

  it('prefers ref when a URL somehow carries both', () => {
    expect(readCodeFromSearch('?ref=AAAA1111&p=BBBB2222')).toBe('AAAA1111');
  });

  it('survives other parameters being present', () => {
    expect(readCodeFromSearch('?utm_source=tg&ref=ABCD2345&x=1')).toBe('ABCD2345');
  });

  it('rejects anything that is not a code', () => {
    expect(readCodeFromSearch('?ref=<script>')).toBeNull();
    expect(readCodeFromSearch('?ref=')).toBeNull();
    expect(readCodeFromSearch('?ref=TOOLONGCODE')).toBeNull();
    expect(readCodeFromSearch('?ref=SHORT')).toBeNull();
    expect(readCodeFromSearch('?other=ABCD2345')).toBeNull();
    expect(readCodeFromSearch('')).toBeNull();
  });
});

describe('readCookieCode', () => {
  it('finds the code among other cookies', () => {
    expect(readCookieCode(`theme=dark; ${REFERRAL_COOKIE}=ABCD2345; x=1`)).toBe('ABCD2345');
  });

  it('returns null when the cookie is absent', () => {
    expect(readCookieCode('theme=dark')).toBeNull();
  });

  it('rejects a tampered cookie value', () => {
    // Cookie foydalanuvchi qo'lida — shakldan o'tmagani serverga
    // umuman yetib bormasligi kerak.
    expect(readCookieCode(`${REFERRAL_COOKIE}=../../etc/passwd`)).toBeNull();
    expect(readCookieCode(`${REFERRAL_COOKIE}=`)).toBeNull();
  });

  it('survives an empty cookie header', () => {
    expect(readCookieCode('')).toBeNull();
  });
});

describe('inviteLinks', () => {
  it('builds a bot link the bot can actually parse', () => {
    // `ref_` prefiksi UpdateHandler.startPayload bilan bir xil bo'lishi
    // shart — ikki yarim faqat shu satrda uchrashadi.
    expect(inviteLinks('ABCD2345', 'https://efbazaar.uz', 'efbazaar_bot').bot)
      .toBe('https://t.me/efbazaar_bot?start=ref_ABCD2345');
  });

  it('builds a site link', () => {
    expect(inviteLinks('ABCD2345', 'https://efbazaar.uz', 'efbazaar_bot').site)
      .toBe('https://efbazaar.uz/?ref=ABCD2345');
  });

  it('omits the bot link when the username is not configured', () => {
    // Bo'sh username bilan `t.me/?start=` yasash — ishlamaydigan
    // havolani nusxalash tugmasi bilan birga ko'rsatish demak.
    expect(inviteLinks('ABCD2345', 'https://efbazaar.uz', '').bot).toBeNull();
  });
});
