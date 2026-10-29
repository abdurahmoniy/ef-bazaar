// Run with a Playwright page or the in-app browser's Playwright adapter.
// Pure DOM measurement: the caller owns navigation, viewport, and theme actions.
export async function verifyAuthViewport(page) {
  const result = await page.evaluate(() => {
    const viewport = { width: innerWidth, height: innerHeight };
    const main = document.querySelector('#auth-main');
    const panel = document.querySelector('section[aria-labelledby="auth-login-title"]');
    const intro = document.querySelector('section[aria-labelledby="auth-intro-title"]');
    const rect = (el) => {
      const box = el.getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom, width: box.width, height: box.height };
    };
    const interactive = [...document.querySelectorAll('header a, header button, main button, main summary, main iframe')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({ label: el.getAttribute('aria-label') || el.textContent || el.tagName, ...rect(el), clipped: el.scrollWidth > el.clientWidth + 1 }));
    return {
      viewport, documentWidth: document.documentElement.scrollWidth,
      contentWidth: document.documentElement.clientWidth,
      frameWidth: main.getBoundingClientRect().width,
      panel: rect(panel), intro: rect(intro), interactive,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      firstRegion: main.querySelector('section').getAttribute('aria-labelledby'),
    };
  });
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  check(result.documentWidth <= result.viewport.width, 'Horizontal page overflow');
  check(Math.abs(result.frameWidth - Math.min(result.contentWidth, 1280)) < 1, 'Auth does not share the 1280px content rail');
  check(result.panel.left >= 0 && result.panel.right <= result.contentWidth + 1, 'Clipped sign-in panel');
  check(result.firstRegion === 'auth-login-title', 'Sign-in must lead the reading and keyboard order');
  for (const control of result.interactive) {
    check(control.left >= 0 && control.right <= result.contentWidth + 1, `Clipped control: ${control.label}`);
    check(!control.clipped, `Overflow inside control: ${control.label}`);
  }
  if (result.viewport.width < 768) check(result.panel.top < result.intro.top, 'Sign-in must lead on phones');
  if (result.viewport.width >= 1024 && result.viewport.height >= 700) {
    check(result.panel.bottom <= result.viewport.height - 16, 'Sign-in controls fall below laptop viewport');
  }
  return { width: result.viewport.width, height: result.viewport.height, theme: result.theme, frameWidth: result.frameWidth, panelBottom: Math.round(result.panel.bottom), overflow: false };
}

export async function verifyAuthSkipLink(page) {
  await page.locator('body').press('Tab');
  const focused = await page.evaluate(() => {
    const el = document.activeElement;
    const box = el.getBoundingClientRect();
    return { href: el.getAttribute('href'), visible: box.top >= 0 && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2) === el };
  });
  if (focused.href !== '#auth-main' || !focused.visible) throw new Error('First-Tab skip link is missing or covered');
  return focused;
}
