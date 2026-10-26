import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { BrandMark } from './brand-mark';
import { eMarkSvg } from './e-mark';
import { StartupIntro } from './startup-intro';

function standalone(markup: string) {
  return markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" color="#ffffff" ');
}

describe('brand mark alignment', () => {
  const intro = renderToStaticMarkup(createElement(StartupIntro));
  const middleSlice = [...intro.matchAll(/<svg\b[\s\S]*?<\/svg>/g)][1][0];
  const favicon = readFileSync(new URL('../../app/icon.svg', import.meta.url), 'utf8');

  it.each([
    ['site logo', standalone(renderToStaticMarkup(createElement(BrandMark)))],
    ['intro middle slice', standalone(middleSlice)],
    ['generated icons', eMarkSvg()],
    ['static favicon', favicon],
  ])('centers the %s crossbar on the same axis as the circular mark', async (_, svg) => {
    // Inspect actual rendered pixels, including the curved right edge. A centered
    // bar has equal outer margins; a fixed path-string assertion would miss this.
    const { data, info } = await sharp(Buffer.from(svg)).resize(1000, 1000)
      .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const row = Math.floor(info.height / 2);
    const glyphPixels = Array.from({ length: info.width }, (_, x) => x).filter(x => {
      const offset = (row * info.width + x) * info.channels;
      return data[offset] > 240 && data[offset + 1] > 240 && data[offset + 2] > 240 && data[offset + 3] > 128;
    });
    expect(glyphPixels.length).toBeGreaterThan(info.width / 2);
    const leftMargin = glyphPixels[0];
    const rightMargin = info.width - 1 - glyphPixels.at(-1)!;
    expect(Math.abs(leftMargin - rightMargin)).toBeLessThanOrEqual(1);
  });

  it('keeps the static favicon identical to the shared icon source', () => {
    expect(favicon.trim()).toBe(eMarkSvg());
  });
});
