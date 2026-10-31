// Browser regression: open the local app with playwright-cli, then run
// playwright-cli run-code --filename scripts/check-startup-motion.js
// Sampling the real CSS timeline avoids jsdom's lack of animation rendering.
async (page) => {
  const origin = new URL(page.url()).origin;
  const source = await page.evaluate(() => ({
    css: [...document.styleSheets].flatMap(sheet => {
      try { return [...sheet.cssRules].map(rule => rule.cssText); } catch { return []; }
    }).join('\n'),
    markup: document.querySelector('#startup-intro').outerHTML,
  }));
  // Keep the application’s actual markup/CSS but remove live hydration,
  // network, and dismissal timers so timeline sampling is deterministic.
  await page.goto('about:blank');
  await page.setContent(`<html data-startup-intro="playing"><head><base href="${origin}/"><style>${source.css}</style></head><body>${source.markup}</body></html>`);
  const results = [];

  for (const [width, height] of [[1200, 800], [390, 844], [667, 375]]) {
    await page.setViewportSize({ width, height });
    await page.locator('#startup-intro').waitFor({ state: 'visible' });

    for (const time of [2600, 4200, 5000]) {
      const state = await page.locator('#startup-intro').evaluate((intro, time) => {
        intro.getAnimations({ subtree: true }).forEach(animation => {
          animation.pause();
          animation.currentTime = time;
        });
        const emblem = intro.querySelector('[class*="emblem"]');
        const parts = [...emblem.querySelectorAll('[class*="Slice"]')].map(part => {
          let matrix = new DOMMatrix();
          for (let element = part; element !== intro; element = element.parentElement) {
            matrix = new DOMMatrix(getComputedStyle(element).transform).multiply(matrix);
          }
          return {
            scaleX: Math.hypot(matrix.a, matrix.b),
            scaleY: Math.hypot(matrix.c, matrix.d),
            angle: Math.atan2(matrix.b, matrix.a),
          };
        });
        const bounds = emblem.getBoundingClientRect();
        return {
          duration: intro.getAnimations()[0].effect.getTiming().duration,
          background: getComputedStyle(intro).backgroundColor,
          ink: getComputedStyle(emblem).color,
          parts,
          fits: bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight,
        };
      }, time);
      const assert = (condition, message) => {
        if (!condition) throw new Error(`${width}×${height}, ${time}ms: ${message}\n${JSON.stringify(state)}`);
      };
      assert(state.duration === 6000, 'Intro must still last six seconds');
      if (time === 2600) {
        assert(state.background === 'rgb(237, 255, 0)' && state.ink === 'rgb(8, 5, 140)',
          'The first assembled e must be blue on the full yellow field, as in the reference');
      } else {
        assert(state.background === 'rgb(8, 5, 140)' && state.ink === 'rgb(237, 255, 0)',
          'The spinning/final mark must return to yellow on blue');
      }
      assert(state.parts.length === 3, 'The e must retain its two arcs and crossbar');
      assert(state.parts.every(part => Math.abs(part.scaleX - part.scaleY) < 0.001),
        'Logo parts must stay circular instead of stretching into ellipses');
      assert(Math.abs(state.parts[0].angle - state.parts[2].angle) < 0.001,
        'Both arcs must turn together around the same centre');
      if (time === 4200) assert(Math.abs(state.parts[0].angle) > 0.1, 'Arcs must still be turning before the final lock');
      if (time === 5000) {
        assert(state.fits, 'The final logo must fit the viewport');
        assert(state.parts.every(part => Math.abs(part.scaleX - 1) < 0.001 && Math.abs(part.angle) < 0.001),
          'All three pieces must settle at the shared logo’s original proportions and orientation');
      }
      results.push({ width, height, time, ...state });
    }
  }
  return results;
}
