import { describe, expect, it } from 'vitest';

import { miniAppStartTarget, readStartParam, startParamTarget } from './mini-app-start-param';

const LISTING = '0f6cbe4c-7a1b-4c2f-9a0e-0f2a1b3c4d5e';

describe('startParamTarget', () => {
  it("hamkor kanalidan kelgan payload referal kodini saqlab qoladi", () => {
    // Manzil brauzerdagi havolaning aynan o'zi: kodni middleware
    // cookie'ga yozadi va hamkor ulushi shunga bog'lanadi.
    expect(startParamTarget(`${LISTING}_K7M4XQP2`)).toBe(
      `/marketplace/${LISTING}?p=K7M4XQP2`,
    );
  });

  it('rasmiy kanaldan kelgan payloadda kod bo‘lmaydi', () => {
    expect(startParamTarget(LISTING)).toBe(`/marketplace/${LISTING}`);
  });

  it('buzuq kodni tashlab yuboradi, e’lonni esa ochadi', () => {
    // Payload havolada ochiq turadi — o'zgartirilgan kod referal bo'lib
    // hisoblanmasligi kerak, lekin e'lonni ko'rishga to'sqinlik ham qilmaydi.
    expect(startParamTarget(`${LISTING}_hack`)).toBe(`/marketplace/${LISTING}`);
    expect(startParamTarget(`${LISTING}_K7M4XQP2_X`)).toBeNull();
  });

  it('e’lon identifikatori shaklga tushmasa navigatsiya bo‘lmaydi', () => {
    expect(startParamTarget('/admin')).toBeNull();
    expect(startParamTarget('..%2Fadmin')).toBeNull();
    expect(startParamTarget('')).toBeNull();
    expect(startParamTarget(null)).toBeNull();
  });
});

describe('readStartParam', () => {
  it('fragmentdan o‘qiydi — u SDK skriptidan oldin joyida turadi', () => {
    const source = {
      location: { hash: `#tgWebAppData=abc&tgWebAppStartParam=${LISTING}_K7M4XQP2` },
    };
    expect(readStartParam(source)).toBe(`${LISTING}_K7M4XQP2`);
  });

  it('fragment bo‘lmasa SDK’dan oladi', () => {
    const source = {
      location: { hash: '' },
      Telegram: { WebApp: { initDataUnsafe: { start_param: LISTING } } },
    };
    expect(readStartParam(source)).toBe(LISTING);
  });

  it('Mini App emas — hech narsa qaytmaydi', () => {
    expect(readStartParam({ location: { hash: '#foo=bar' } })).toBeNull();
    expect(miniAppStartTarget({ location: { hash: '' } })).toBeNull();
  });
});
