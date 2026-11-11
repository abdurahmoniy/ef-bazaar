import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';

import OpenGraphImage, { alt, contentType, size } from './opengraph-image';
import TwitterImage from './twitter-image';

type Rgb = [number, number, number];

// Shared theme roles from globals.css (light): --primary and --secondary.
const BRAND_BLUE: Rgb = [0, 0, 153];
const BRAND_GOLD: Rgb = [249, 191, 16];
// The retired teal identity the previous share card was built on.
const RETIRED_TEAL: Rgb = [29, 139, 128];

interface Decoded {
  width: number;
  height: number;
  channels: number;
  data: Buffer;
}

async function decode(response: Response): Promise<Decoded> {
  const png = Buffer.from(await response.arrayBuffer());
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, channels: info.channels, data };
}

function share(image: Decoded, [r, g, b]: Rgb, tolerance = 14) {
  let hits = 0;
  for (let i = 0; i < image.data.length; i += image.channels) {
    if (
      Math.abs(image.data[i] - r) <= tolerance &&
      Math.abs(image.data[i + 1] - g) <= tolerance &&
      Math.abs(image.data[i + 2] - b) <= tolerance
    ) {
      hits += 1;
    }
  }
  return hits / (image.width * image.height);
}

describe('share card (Open Graph / Twitter)', () => {
  let card: Decoded;

  beforeAll(async () => {
    card = await decode(await OpenGraphImage());
  }, 30_000);

  it('renders a 1200×630 PNG, the size link previews expect', () => {
    expect(contentType).toBe('image/png');
    expect(size).toEqual({ width: 1200, height: 630 });
    expect([card.width, card.height]).toEqual([1200, 630]);
  });

  it('uses the current blue and gold identity', () => {
    expect(share(card, BRAND_BLUE)).toBeGreaterThan(0.01);
    expect(share(card, BRAND_GOLD)).toBeGreaterThan(0.01);
  });

  it('no longer shows the retired teal card', () => {
    expect(share(card, RETIRED_TEAL)).toBeLessThan(0.001);
  });

  it('describes the marketplace in Uzbek for screen readers', () => {
    expect(alt).toContain('eFBazaar');
    expect(alt).toContain('eFootball akkount bozori');
  });

  it('serves the same card to Twitter', async () => {
    const twitter = await decode(await TwitterImage());
    expect([twitter.width, twitter.height]).toEqual([1200, 630]);
    expect(share(twitter, BRAND_BLUE)).toBeCloseTo(share(card, BRAND_BLUE), 3);
  }, 30_000);
});
