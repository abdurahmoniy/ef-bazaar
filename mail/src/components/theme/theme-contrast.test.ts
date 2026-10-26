// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { InboxList } from '../mail/inbox-list';
import { InboxView } from '../mail/inbox-view';
import { MailSidebar } from '../mail/mail-sidebar';
import { mailAvatarColor } from '@/lib/mail-format';

import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { beforeAll, describe, expect, it } from 'vitest';

import config from '../../../tailwind.config';

type Rgb = [number, number, number];
const source = readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
const tokens: Record<string, Record<string, string>> = { light: {}, dark: {} };
const styles: Record<string, Record<string, string>> = {};

beforeAll(async () => {
  const result = await postcss([tailwindcss({
    ...config,
    content: [...config.content as string[], { raw: '<div class="dark text-primary text-primary-foreground bg-primary text-destructive text-destructive-foreground bg-destructive focus-visible:ring-ring dark:focus-visible:ring-ring"></div>' }],
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
  const resolved = value.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    if (name.startsWith('--tw-') && name.endsWith('-opacity')) return '1';
    if (!tokens[theme][name]) throw new Error(`Missing ${theme} token: ${name}`);
    return tokens[theme][name];
  }).replace(/var\((--[\w-]+)\)/g, (_, name: string) => tokens[theme][name]);
  const rgb = resolved.match(/rgb\((\d+) (\d+) (\d+)/);
  if (rgb) return [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
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
  it('separates mail panes, menus and hover surfaces from their surroundings', () => {
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
  it.each(['background', 'card', 'popover', 'muted'])('keeps small error text readable on %s', (surface) => {
    expect(contrast(color(styles['.text-destructive'].color, 'light'), token(surface, 'light'))).toBeGreaterThanOrEqual(4.5);
  });
  it.each(['primary', 'destructive'])('keeps %s text and fill on their semantic tokens', (name) => {
    expect(color(styles[`.text-${name}`].color, 'light')).toEqual(token(`${name}-text`, 'light'));
    expect(color(styles[`.bg-${name}`]['background-color'], 'light')).toEqual(token(name, 'light'));
  });
});


// Resolve the compiled utilities used by real rows, including dark variants.
// Checking the rendered colors keeps the contrast guard independent of class names.
function rowPaint(html: string, selector: string, property: string, theme = 'dark') {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.append(container);
  const element = container.querySelector(selector)!;
  let value: string | undefined;
  for (const [rule, declarations] of Object.entries(styles)) {
    if (!declarations[property] || /(?<!\\):(hover|active|focus|focus-visible|before|after|selection)/.test(rule)) continue;
    try {
      if (element.matches(rule) && /(?:hsl|rgb)\(/.test(declarations[property])) value = declarations[property];
    } catch { /* Pseudo-elements and browser-only selectors cannot paint this row. */ }
  }
  container.remove();
  if (!value) return token('card', theme);
  const opacity = value.match(/\/\s*([\d.]+)\s*\)/)?.[1];
  return blend(color(value, theme), token('card', theme), opacity ? Number(opacity) : 1);
}

const inbox = (seen: boolean) => renderToStaticMarkup(createElement(InboxList, {
  mailboxId: 'mailbox-1', mailboxEmail: 'mail@example.com', messages: [{
    messageId: '1', subject: 'Security code', fromName: 'Konami', fromAddress: 'notice@example.com',
    receivedAt: '2026-10-20T10:00:00Z', snippet: 'Your code', seen, hasAttachments: false,
  }],
}));

describe('webmail colors', () => {
  it('keeps the inbox search field boundary visible against the toolbar and its fill', () => {
    const html = renderToStaticMarkup(createElement(InboxView, {
      mailboxId: 'mailbox-1', mailboxEmail: 'mail@example.com', messages: [{
        messageId: '1', subject: 'Security code', fromName: 'Konami', fromAddress: 'notice@example.com',
        receivedAt: '2026-10-20T10:00:00Z', snippet: 'Your code', seen: false, hasAttachments: false,
      }],
    }));
    const border = rowPaint(html, 'input[type="search"]', 'border-color');
    expect(contrast(border, token('card'))).toBeGreaterThanOrEqual(3);
    expect(contrast(border, rowPaint(html, 'input[type="search"]', 'background-color'))).toBeGreaterThanOrEqual(3);
  });

  it('distinguishes unread rows and their small indicator from the reading surface', () => {
    const unread = inbox(false);
    expect(contrast(rowPaint(unread, 'a', 'background-color'), token('card'))).toBeGreaterThanOrEqual(1.2);
    expect(contrast(rowPaint(unread, '[aria-hidden="true"]', 'background-color'), rowPaint(unread, 'a', 'background-color'))).toBeGreaterThanOrEqual(3);
    expect(rowPaint(inbox(true), 'a', 'background-color')).toEqual(token('card'));
  });

  it('keeps the active mailbox indicator distinct from the selected row', () => {
    const html = renderToStaticMarkup(createElement(MailSidebar, { activeMailboxId: 'mailbox-1', mailboxes: [{
      id: 'mailbox-1', email: 'mail@example.com', unreadCount: 2, locked: false, lastActivityAt: null, ownedSince: '',
    }] }));
    const selected = rowPaint(html, 'a[aria-current="page"]', 'background-color');
    expect(contrast(selected, token('card'))).toBeGreaterThanOrEqual(1.2);
    expect(contrast(rowPaint(html, 'a[aria-current="page"] > [aria-hidden="true"]', 'background-color'), selected)).toBeGreaterThanOrEqual(3);
  });

  it.each(['light', 'dark'])('keeps warning text legible on its banner in %s mode', (theme) => {
    expect(contrast(token('warning', theme), token('warning-soft', theme))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('warning', theme), token('card', theme))).toBeGreaterThanOrEqual(4.5);
  });

  it('uses the shared readable link color for HTML and plain text email bodies', () => {
    const html = '<div class="mail-html-body"><a href="https://example.com">Reset password</a></div><div class="mail-plain-body"><a href="https://example.com">Reset password</a></div>';
    for (const selector of ['.mail-html-body a', '.mail-plain-body a']) {
      const text = rowPaint(html, selector, 'color');
      expect(text).toEqual(color(styles['.text-primary'].color, 'dark'));
      expect(contrast(text, token('card'))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('provides visible keyboard focus for bare controls, links and disclosure summaries', () => {
    for (const selector of ['input:focus-visible', 'textarea:focus-visible', 'select:focus-visible', 'button:focus-visible', 'a:focus-visible', 'summary:focus-visible']) {
      const rule = Object.entries(styles).find(([selectors]) => selectors.split(',').map(s => s.trim()).includes(selector))?.[1];
      expect(rule?.outline).toBe('2px solid hsl(var(--ring))');
      expect(rule?.['outline-offset']).toBe('2px');
    }
  });

  it('leaves the page background clear of decorative capsule overlays', () => {
    expect(Object.keys(styles).some(selector => /body::(?:before|after)/.test(selector))).toBe(false);
  });

  it('preserves readable white initials on the intentional avatar identity colors', () => {
    const colors = new Set(Array.from({ length: 100 }, (_, i) => mailAvatarColor(`account-${i}@example.com`)));
    expect(colors.size).toBe(7);
    for (const fill of colors) expect(contrast([1, 1, 1], color(fill, 'dark'))).toBeGreaterThanOrEqual(4.5);
  });
});
