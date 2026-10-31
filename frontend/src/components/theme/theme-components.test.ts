// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import config from '../../../tailwind.config';
import { TelegramPreview } from '@/components/admin/telegram-preview';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { avatarTone } from '@/lib/chat-format';
import { VoicePlayer } from '@/components/chat/voice-player';
import { ListingCard } from '@/components/marketplace/listing-card';

let compiled: postcss.Root;
const globals = readFileSync('src/app/globals.css', 'utf8');
const markup = renderToStaticMarkup(createElement('main', { className: 'bg-card' },
  createElement(Badge, { variant: 'warn', id: 'warning' }, 'Pending'),
  createElement(Badge, { variant: 'info', id: 'info' }, 'Information'),
  createElement(Checkbox, { label: 'Accept terms' }),
  createElement('div', { id: 'voice', className: 'bg-card' }, createElement(VoicePlayer, { src: '/synthetic-audio', seed: 'theme', mine: false })),
  createElement(ListingCard, { readOnly: true, listing: { id: 'theme-sold', sellerId: 'demo', description: 'Sold account', price: 100, priceNegotiable: false, attributes: {}, mediaMessageIds: [], status: 'SOLD', forwardCount: 0, likeCount: 0, createdAt: '2026-10-26T00:00:00Z', updatedAt: '2026-10-26T00:00:00Z' } }),
  ...Array.from({ length: 8 }, (_, index) => createElement('span', { key: index, id: `avatar-${index}`, className: avatarTone(String(index)) }, 'A')),
  createElement(TelegramPreview, { html: '<a href="https://example.com">Read more</a>', bannerUrl: null, buttons: [[{ text: 'Open', url: 'https://example.com' }]] }),
  createElement('button', { id: 'native', className: 'keyboard-focus' }, 'Close'),
));
beforeAll(async () => {
  const result = await postcss([tailwindcss({ ...config, content: [{ raw: `dark ${markup}` }, 'src/components/chat/voice-player.tsx'] })]).process(globals, { from: undefined });
  compiled = result.root;
});
afterEach(() => { document.head.innerHTML = ''; document.body.innerHTML = ''; document.documentElement.className = ''; });

function render(theme: string) {
  const css = compiled.clone();
  const tokens: Record<string, string> = {};
  for (const selector of theme === 'dark' ? [':root', '.dark'] : [':root']) {
    css.walkRules(selector, rule => { rule.walkDecls(/^--/, decl => { tokens[decl.prop] = decl.value; }); });
  }
  const resolve = (value: string): string => value.replace(/var\((--[\w-]+)(?:,\s*[^)]+)?\)/g, (original, name: string) => {
    if (name.endsWith('-opacity')) return '1';
    return tokens[name] ? resolve(tokens[name]) : original;
  });
  css.walkDecls(decl => { decl.value = resolve(decl.value); });
  css.walkRules(rule => { rule.selector = rule.selector.replaceAll(':focus-visible', '.keyboard-focus'); });
  document.head.innerHTML = `<style>${css.toString()}</style>`;
  document.documentElement.className = theme === 'dark' ? 'dark' : '';
  document.body.innerHTML = markup;
  return (name: string) => {
    const node = document.createElement('span');
    node.style.color = resolve(`hsl(var(--${name}))`);
    document.body.append(node);
    const color = getComputedStyle(node).color;
    node.remove();
    return color;
  };
}
function contrast(a: string, b: string) {
  const luminance = (value: string) => {
    const rgb = value.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(n => n / 255);
    const linear = rgb.map(n => n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4);
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
  };
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + .05) / (low + .05);
}
describe.each(['light', 'dark'])('%s rendered controls', theme => {
  it.each(['warning', 'info'])('uses the shared %s notice palette', name => {
    const token = render(theme);
    const badge = getComputedStyle(document.getElementById(name)!);
    expect(badge.color).toBe(token(name));
    expect(badge.backgroundColor).toBe(token(`${name}-soft`));
    expect(contrast(badge.color, badge.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps Telegram preview links readable on the themed message surface', () => {
    const token = render(theme);
    const link = document.querySelector('.tg-preview a')!;
    const surface = getComputedStyle(link.parentElement!.parentElement!.parentElement!);
    expect(contrast(getComputedStyle(link).color, surface.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(surface.backgroundColor).toBe(token('card'));
  });
  it.each(Array.from({ length: 8 }, (_, index) => index))('keeps avatar %s initials readable', index => {
    render(theme);
    const avatar = getComputedStyle(document.getElementById(`avatar-${index}`)!);
    expect(contrast(avatar.color, avatar.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps the sold label readable on its media pill', () => {
    render(theme);
    const pill = getComputedStyle(document.querySelector('[role="status"] > span')!);
    expect(contrast(pill.color, pill.backgroundColor)).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps played incoming voice bars visible as playback advances', async () => {
    render(theme);
    const container = document.getElementById('voice')!;
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(VoicePlayer, { src: '/synthetic-audio', seed: 'theme', mine: false })));
      const audio = container.querySelector('audio')!;
      Object.defineProperty(audio, 'duration', { value: 10 });
      audio.currentTime = 5;
      audio.pause = vi.fn();
      await act(async () => { audio.dispatchEvent(new Event('timeupdate')); });
      expect(container.textContent).toContain('0:05');
      const played = getComputedStyle(container.querySelector('[aria-hidden] > span')!);
      expect(contrast(played.backgroundColor, getComputedStyle(container).backgroundColor)).toBeGreaterThanOrEqual(3);
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
  it('provides keyboard focus on bare buttons and the visible checkbox label', () => {
    render(theme);
    const button = getComputedStyle(document.getElementById('native')!);
    expect(button.outline).toMatch(/2px solid/);
    const input = document.querySelector('input')!;
    input.classList.add('keyboard-focus');
    expect(getComputedStyle(input.closest('label')!).outline).toMatch(/2px solid/);
  });
});
