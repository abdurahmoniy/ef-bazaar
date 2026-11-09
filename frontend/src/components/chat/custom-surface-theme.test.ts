// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import { afterEach, describe, expect, it } from 'vitest';

type Theme = 'light' | 'dark';
type Rgb = [number, number, number];
const read = (file: string) => readFileSync(path.join(process.cwd(), 'src', file), 'utf8');
const globals = postcss.parse(read('app/globals.css'));

function variables(css: postcss.Root, selectors: string[], initial: Record<string, string> = {}) {
  const values = { ...initial };
  for (const selector of selectors) {
    css.walkRules(selector, rule => {
      rule.walkDecls(/^--/, decl => { values[decl.prop] = decl.value; });
    });
  }
  return values;
}

function resolve(value: string, values: Record<string, string>): string {
  return value.replace(/var\((--[\w-]+)\)/g, (original, name: string) => (
    values[name] ? resolve(values[name], values) : original
  ));
}

function render(cssFile: string, markup: string, theme: Theme, scopes: string[] = []) {
  const tokens = variables(globals, theme === 'dark' ? [':root', '.dark'] : [':root']);
  const css = postcss.parse(read(cssFile));
  const values = variables(css, scopes, tokens);
  // jsdom does not resolve CSS variables. Resolve only color values, then let its
  // stylesheet cascade match the actual selectors against the visible markup.
  css.walkDecls(decl => { decl.value = resolve(decl.value, values); });
  const style = document.createElement('style');
  style.textContent = css.toString().replace(/:global\(([^)]+)\)/g, '$1');
  document.head.append(style);
  document.documentElement.className = theme === 'dark' ? 'dark' : '';
  document.body.innerHTML = markup;
  return { tokens, css: (selector: string) => getComputedStyle(document.querySelector(selector)!) };
}

function rgb(value: string): Rgb {
  const probe = document.createElement('span');
  probe.style.color = value;
  document.body.append(probe);
  const normalized = getComputedStyle(probe).color;
  probe.remove();
  const channels = normalized.match(/^rgba?\(([^)]+)\)$/)?.[1].split(',').map(Number);
  if (!channels) throw new Error(`Unresolved color: ${value}`);
  return channels.slice(0, 3).map(channel => channel / 255) as Rgb;
}

function token(name: string, values: Record<string, string>) {
  return rgb(resolve(`hsl(var(--${name}))`, values));
}

function blend(foreground: Rgb, background: Rgb, opacity: number): Rgb {
  return foreground.map((channel, i) => channel * opacity + background[i] * (1 - opacity)) as Rgb;
}

function contrast(first: Rgb, second: Rgb) {
  const luminance = (color: Rgb) => {
    const channels = color.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4);
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const [low, high] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (high + .05) / (low + .05);
}

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe.each<Theme>(['light', 'dark'])('%s custom surfaces', theme => {
  it('gives landing actions the same readable brand colors as the marketplace', () => {
    const { css, tokens } = render('components/landing-v2/landing-v2.module.css',
      '<main class="landing"><a class="primaryButton">Bozorni ko‘rish</a><p class="heroIntro">Epic kartali akkountlarni toping.</p></main>',
      theme, ['.landing']);
    expect(rgb(css('.landing').backgroundColor)).toEqual(token('background', tokens));
    expect(rgb(css('.landing').color)).toEqual(token('foreground', tokens));
    const action = css('.primaryButton');
    expect(rgb(action.backgroundColor)).toEqual(token('primary', tokens));
    expect(rgb(action.color)).toEqual(token('primary-foreground', tokens));
    expect(contrast(rgb(action.color), rgb(action.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(css('.heroIntro').color), rgb(css('.landing').backgroundColor))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps landing notices and gold highlights readable in the selected theme', () => {
    const { css, tokens } = render('components/landing-v2/landing-v2.module.css',
      '<main class="landing"><aside class="smartAdmin"><p class="smartLabel">Avtomatik Garov</p><p class="smartTitle"><span>Kutmaysiz.</span></p><p class="smartDescription">Mablag‘ Garovda saqlanadi.</p></aside><span class="flowActive">Garov</span></main>',
      theme, ['.landing']);
    expect(rgb(css('.smartAdmin').backgroundColor)).toEqual(token('card', tokens));
    expect(rgb(css('.smartTitle > span').backgroundColor)).toEqual(token('secondary', tokens));
    expect(rgb(css('.smartTitle > span').color)).toEqual(token('secondary-foreground', tokens));
    expect(contrast(rgb(css('.smartTitle > span').color), rgb(css('.smartTitle > span').backgroundColor))).toBeGreaterThanOrEqual(4.5);
    for (const selector of ['.smartLabel', '.smartDescription']) {
      expect(contrast(rgb(css(selector).color), rgb(css('.smartAdmin').backgroundColor))).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(rgb(css('.flowActive').color), rgb(css('.landing').backgroundColor))).toBeGreaterThanOrEqual(4.5);
  });

  it('gives the chat send action the same readable colors as other primary actions', () => {
    const { css, tokens } = render('components/chat/chat-conversation.css',
      '<section class="chat-conversation"><button class="chat-send-button">Send</button></section>',
      theme, ['.chat-conversation', ...(theme === 'dark' ? ['.dark .chat-conversation'] : [])]);
    const send = css('.chat-send-button');
    expect(contrast(rgb(send.color), rgb(send.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    expect(rgb(send.backgroundColor)).toEqual(token('primary', tokens));
    expect(rgb(send.color)).toEqual(token('primary-foreground', tokens));
  });

  it('keeps compact gamer labels readable and panels visibly separated', () => {
    const { css, tokens } = render('components/gamer/gamer-card.css',
      '<section class="gc-card gc-compact"><div class="gc-ava">A</div><div class="gc-c-strip"><div><b class="gc-c-w">10</b><b class="gc-c-l">2</b><span>WIN RATE</span></div></div></section>',
      theme, ['.gc-card', '.gc-card.gc-compact']);
    const card = rgb(css('.gc-card').backgroundColor);
    const tile = rgb(css('.gc-c-strip > div').backgroundColor);
    expect(contrast(rgb(css('.gc-c-strip span').color), tile)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(tile, card)).toBeGreaterThanOrEqual(theme === 'dark' ? 1.2 : 1.05);
    expect(card).toEqual(token('card', tokens));
    for (const selector of ['.gc-c-w', '.gc-c-l']) {
      expect(contrast(rgb(css(selector).color), tile)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(rgb(css('.gc-ava').color), rgb(css('.gc-ava').backgroundColor))).toBeGreaterThanOrEqual(4.5);
  });

  it('themes the gamer viewer close control with a visible boundary', () => {
    const { css, tokens } = render('components/gamer/gamer-card.css',
      '<section class="gc-viewer"><button class="gc-viewer-close">Close</button></section>', theme);
    const button = css('.gc-viewer-close');
    expect(rgb(button.backgroundColor)).toEqual(token('card', tokens));
    expect(contrast(rgb(button.color), rgb(button.backgroundColor))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(button.borderTopColor), rgb(button.backgroundColor))).toBeGreaterThanOrEqual(theme === 'dark' ? 3 : 1.3);
  });

  it('uses the shared link color for plan help without changing premium artwork', () => {
    const { css, tokens } = render('components/plans/plans.module.css',
      '<main class="page"><a class="supportLink">Help</a><section class="card featured"><header class="cardHeader"><span class="cardEdition">PRO</span></header></section></main>', theme);
    expect(rgb(css('.supportLink').color)).toEqual(token('primary-text', tokens));
    expect(contrast(rgb(css('.supportLink').color), token('background', tokens))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(css('.cardEdition').color), rgb(css('.cardHeader').backgroundColor))).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the shared link color for profile shortcuts', () => {
    const { css, tokens } = render('components/profile/profile-membership.module.css',
      '<section class="membership"><a class="textLink">Manage plan</a></section>', theme);
    expect(rgb(css('.textLink').color)).toEqual(token('primary-text', tokens));
    expect(contrast(rgb(css('.textLink').color), rgb(css('.membership').backgroundColor))).toBeGreaterThanOrEqual(4.5);
  });
});

it('keeps dark chat bubbles separated from the canvas and their metadata readable', () => {
  const { css, tokens } = render('components/chat/chat-conversation.css',
    '<section class="chat-conversation"><article class="chat-message-bubble" data-mine="true"><span class="chat-message-meta">12:30</span></article></section>',
    'dark', ['.chat-conversation', '.dark .chat-conversation']);
  const canvas = rgb(css('.chat-conversation').backgroundColor);
  const bubble = rgb(css('.chat-message-bubble').backgroundColor);
  expect(canvas).toEqual(token('background', tokens));
  expect(contrast(bubble, canvas)).toBeGreaterThanOrEqual(1.2);
  expect(contrast(rgb(css('.chat-message-meta').color), bubble)).toBeGreaterThanOrEqual(4.5);
});

it('keeps photo timestamps readable over a white image in either theme', () => {
  const { css } = render('components/chat/chat-conversation.css',
    '<article class="chat-message-bubble"><span class="chat-message-meta" data-overlay="true">12:30</span></article>', 'dark');
  const overlay = css('.chat-message-meta');
  const opacity = Number(overlay.backgroundColor.match(/rgba\([\d, ]+, ([\d.]+)\)/)?.[1] ?? 1);
  expect(contrast(rgb(overlay.color), blend(rgb(overlay.backgroundColor), [1, 1, 1], opacity))).toBeGreaterThanOrEqual(4.5);
});

it('keeps exported gamer poster labels readable on its fixed artwork palette', () => {
  const palette = (theme: Theme) => {
    const { css } = render('components/gamer/gamer-card.css',
      '<section class="gc-card"><div class="gc-tile"><span class="gc-tile-cap">MATCHES</span></div></section>',
      theme, ['.gc-card']);
    return { text: rgb(css('.gc-tile-cap').color), background: rgb(css('.gc-tile').backgroundColor) };
  };
  const light = palette('light');
  const dark = palette('dark');
  expect(light).toEqual(dark);
  expect(contrast(dark.text, dark.background)).toBeGreaterThanOrEqual(4.5);
});
