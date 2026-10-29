import assert from 'node:assert/strict';

/**
 * Browser regression check for /landing-v2. Pass a Playwright page or the
 * in-app browser tab's `playwright` adapter after setting the test viewport.
 * Check laptop sizes (1470×820, 1366×768, 1280×720) and phone widths (320, 390).
 * Header controls follow marketplace sizing on desktop and 44px targets on phones.
 * This uses the real layout engine; jsdom cannot validate rendered geometry.
 */
export async function verifyLandingViewport(page) {
  const result = await page.evaluate(() => {
    const hero = document.querySelector('section[aria-labelledby="landing-v2-title"]');
    const bounds = (element) => {
      if (!element) throw new Error('Landing content is missing');
      const rect = element.getBoundingClientRect();
      return { top: rect.top + scrollY, bottom: rect.bottom + scrollY, left: rect.left, right: rect.right, width: rect.width, height: rect.height };
    };
    return {
      width: innerWidth,
      height: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      logo: bounds(document.querySelector('header a[aria-label="eFBazaar bosh sahifa"]')),
      themeToggle: bounds(document.querySelector('header button')),
      login: bounds(document.querySelector('header a[href="/auth/login"], header a[href="/profile"]')),
      title: bounds(hero?.querySelector('h1')),
      primary: bounds(hero?.querySelector('a[href="/marketplace"]')),
      selling: bounds(hero?.querySelector('a[href="/marketplace/new"]')),
      adminPanel: bounds(hero?.querySelector('a[href="#garov"]')?.closest('div')),
      hero: bounds(hero),
    };
  });

  assert.ok(result.documentWidth <= result.width, `Horizontal overflow at ${result.width}px`);
  for (const name of ['logo', 'themeToggle', 'login', 'title', 'primary', 'selling', 'adminPanel']) {
    const box = result[name];
    assert.ok(box.left >= 0 && box.right <= result.width, `${name} is clipped horizontally`);
  }
  for (const name of ['primary', 'selling']) {
    assert.ok(result[name].height >= 44, `${name} target is shorter than 44px`);
  }
  for (const name of ['themeToggle', 'login']) {
    const minimum = result.width <= 640 ? 44 : 36;
    assert.ok(result[name].height >= minimum, `${name} is smaller than the shared header target`);
  }
  if (result.width >= 1024 && result.height >= 700) {
    assert.ok(result.adminPanel.bottom <= result.height - 16,
      `Smart Admin panel ends at ${Math.round(result.adminPanel.bottom)}px in a ${result.height}px laptop viewport`);
    assert.ok(result.hero.bottom <= result.height,
      `Hero ends at ${Math.round(result.hero.bottom)}px in a ${result.height}px laptop viewport`);
  }
  return result;
}

/** Compare the shared chrome against the actual marketplace at the same viewport. */
export async function verifyMarketplaceChrome(landingPage, marketplacePage) {
  const measure = (page) => page.evaluate(() => {
    const header = document.querySelector('header');
    const logo = header?.querySelector('a[aria-label="eFBazaar bosh sahifa"]');
    const theme = header?.querySelector('button[aria-label="Yorug‘ rejim"], button[aria-label="Qorong‘i rejim"]');
    const action = header?.querySelector('a[href="/auth/login"], a[href="/profile"]');
    const nav = header?.querySelector('nav a');
    if (!header || !logo || !theme || !action || !nav) throw new Error('Compare signed-out desktop headers');
    return {
      viewport: [innerWidth, innerHeight],
      clientWidth: document.documentElement.clientWidth,
      frameWidth: header.firstElementChild.getBoundingClientRect().width,
      height: header.getBoundingClientRect().height,
      logoLeft: logo.getBoundingClientRect().left,
      actionRight: action.getBoundingClientRect().right,
      themeSize: theme.getBoundingClientRect().width,
      font: getComputedStyle(document.querySelector('main')).fontFamily,
      navFont: getComputedStyle(nav).fontFamily,
      navSize: getComputedStyle(nav).fontSize,
      navWeight: getComputedStyle(nav).fontWeight,
      actionFill: getComputedStyle(action).backgroundColor,
      actionColor: getComputedStyle(action).color,
    };
  });
  const landing = await measure(landingPage);
  const marketplace = await measure(marketplacePage);
  assert.deepEqual(landing.viewport, marketplace.viewport, 'Compare headers at the same viewport');
  const expectedWidth = Math.min(landing.clientWidth, 1280);
  assert.equal(landing.frameWidth, expectedWidth, 'Landing must use the shared wide content area');
  assert.equal(marketplace.frameWidth, expectedWidth, 'Marketplace must use the shared wide content area');
  for (const key of ['height', 'logoLeft', 'actionRight', 'themeSize']) {
    assert.ok(Math.abs(landing[key] - marketplace[key]) <= 1,
      `Header ${key} differs: landing ${landing[key]}, marketplace ${marketplace[key]}`);
  }
  for (const key of ['font', 'navFont', 'navSize', 'navWeight', 'actionFill', 'actionColor']) {
    assert.equal(landing[key], marketplace[key], `Header ${key} must match marketplace`);
  }
  return { landing, marketplace };
}

/** Run immediately after loading the landing to check first-Tab visibility. */
export async function verifyLandingSkipLink(page) {
  await page.locator('body').press('Tab');
  const result = await page.evaluate(() => {
    const link = document.activeElement;
    const box = link.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return { href: link.getAttribute('href'), visible: link === hit || link.contains(hit), coveringTag: hit?.tagName };
  });
  assert.equal(result.href, '#landing-v2-main', 'First Tab must focus the skip link');
  assert.ok(result.visible, `Skip link is covered by ${result.coveringTag}`);
  return result;
}
