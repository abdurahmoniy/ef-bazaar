import { readFileSync } from 'node:fs';
import path from 'node:path';

import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

import config from '../../../tailwind.config';
import { MONEY_COLORS } from '@/lib/payment-analytics';

type Rgb = [number, number, number];
const source = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
const tokens: Record<string, Record<string, string>> = { light: {}, dark: {} };
const styles: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  const result = await postcss([tailwindcss({
    ...config,
    content: [{ raw: '<div class="dark text-primary text-primary-foreground bg-primary text-destructive text-destructive-foreground bg-destructive text-success bg-success-soft text-warning bg-warning-soft text-info bg-info-soft focus-visible:ring-ring dark:focus-visible:ring-ring"></div>' }],
  })]).process(source, { from: undefined });
  result.root.walkRules((rule) => {
    const declarations: Record<string, string> = {};
    rule.walkDecls((decl) => { declarations[decl.prop] = decl.value; });
    if (rule.selector === ':root') Object.assign(tokens.light, declarations);
    if (rule.selector === '.dark') Object.assign(tokens.dark, declarations);
    styles[rule.selector] = declarations;
  });
  tokens.dark = { ...tokens.light, ...tokens.dark };
});

function color(value: string, theme: string): Rgb {
  let resolved = value;
  for (let depth = 0; depth < 5 && resolved.includes('var('); depth++) {
    resolved = resolved.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
      if (name.startsWith('--tw-') && name.endsWith('-opacity')) return '1';
      if (!tokens[theme][name]) throw new Error(`Missing ${theme} token: ${name}`);
      return tokens[theme][name];
    });
  }
  if (/^#[\da-f]{6}$/i.test(resolved)) {
    return [1, 3, 5].map((offset) => parseInt(resolved.slice(offset, offset + 2), 16) / 255) as Rgb;
  }
  const match = resolved.match(/(?:hsl\()?([\d.]+) ([\d.]+)% ([\d.]+)%/);
  if (!match) throw new Error(`Unsupported color: ${resolved}`);
  const h = Number(match[1]) / 30;
  const s = Number(match[2]) / 100;
  const l = Number(match[3]) / 100;
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number) => {
    const k = (n + h) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [channel(0), channel(8), channel(4)];
}

function token(name: string, theme = 'dark') {
  return color(`var(--${name})`, theme);
}

function luminance(rgb: Rgb) {
  const linear = rgb.map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: Rgb, b: Rgb) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

function blend(foreground: Rgb, background: Rgb, opacity: number): Rgb {
  return foreground.map((c, i) => c * opacity + background[i] * (1 - opacity)) as Rgb;
}

describe('dark theme visibility', () => {
  // Surface thresholds are product guardrails, not WCAG text requirements.
  it('separates listing cards, menus and hover surfaces from their surroundings', () => {
    expect(contrast(token('card'), token('background'))).toBeGreaterThanOrEqual(1.2);
    expect(luminance(token('popover'))).toBeGreaterThan(luminance(token('card')));
    expect(contrast(token('muted'), token('card'))).toBeGreaterThanOrEqual(1.2);
    expect(contrast(token('border'), token('card'))).toBeGreaterThanOrEqual(1.5);
  });

  it.each(['background', 'card', 'popover', 'muted'])('keeps input boundaries visible on %s', (surface) => {
    expect(contrast(token('input'), token(surface))).toBeGreaterThanOrEqual(3);
  });

  it.each(['background', 'card', 'popover', 'muted'])('keeps small blue text and icons readable on %s', (surface) => {
    const text = color(styles['.text-primary'].color, 'dark');
    expect(contrast(text, token(surface))).toBeGreaterThanOrEqual(4.5);
    // Verified badges use a 25% primary fill in dark mode.
    expect(contrast(text, blend(token('primary'), token(surface), 0.25))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['background', 'card', 'popover', 'muted'])('keeps small error text readable on %s', (surface) => {
    expect(contrast(color(styles['.text-destructive'].color, 'dark'), token(surface))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps muted labels and translucent input placeholders readable', () => {
    expect(contrast(token('muted-foreground'), token('muted'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(blend(token('muted-foreground'), token('card'), 0.7), token('card'))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(['primary', 'destructive'])('keeps %s button labels readable in default and hover states', (name) => {
    const text = color(styles[`.text-${name}-foreground`].color, 'dark');
    const fill = color(styles[`.bg-${name}`]['background-color'], 'dark');
    expect(contrast(text, fill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, blend(fill, token('card'), 0.9))).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps keyboard focus visible on raised surfaces', () => {
    expect(contrast(token('ring'), token('muted'))).toBeGreaterThanOrEqual(3);
  });
});

describe('light theme compatibility', () => {
  it.each(['primary', 'destructive'])('keeps %s text readable while preserving button fills', (name) => {
    expect(contrast(color(styles[`.text-${name}`].color, 'light'), token('muted', 'light'))).toBeGreaterThanOrEqual(4.5);
    expect(color(styles[`.bg-${name}`]['background-color'], 'light')).toEqual(token(name, 'light'));
  });
});

describe.each(['light', 'dark'])('%s semantic status colors', (theme) => {
  it.each(['success', 'warning', 'info'])('keeps %s labels readable on cards and tinted notices', (name) => {
    expect(styles[`.text-${name}`], `Missing shared ${name} text color`).toBeDefined();
    const text = color(styles[`.text-${name}`].color, theme);
    expect(contrast(text, token('card', theme))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(text, token(`${name}-soft`, theme))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.keys(MONEY_COLORS) as (keyof typeof MONEY_COLORS)[])('keeps %s financial labels readable', (name) => {
    expect(contrast(color(MONEY_COLORS[name], theme), token('card', theme))).toBeGreaterThanOrEqual(4.5);
  });
});
