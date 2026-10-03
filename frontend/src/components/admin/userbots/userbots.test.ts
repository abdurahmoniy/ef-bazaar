// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { UserbotAccount, UserbotFeature } from '@/lib/userbot-types';
import * as client from '@/lib/userbot-client';
import { UserbotAccountCard } from './userbot-account-card';
import { UserbotFeatureRow } from './userbot-feature-row';
import { UserbotLoginDialog } from './userbot-login-dialog';
import { UserbotPanel } from './userbot-panel';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));
vi.mock('@/lib/userbot-client', async (orig) => ({
  ...(await orig<typeof import('@/lib/userbot-client')>()),
  startLogin: vi.fn(),
  submitCode: vi.fn(),
  submitPassword: vi.fn(),
  resendCode: vi.fn(),
  cancelLogin: vi.fn(),
  listAccounts: vi.fn(),
  listFeatures: vi.fn(),
  disconnectAccount: vi.fn(),
  bindFeature: vi.fn(),
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date('2026-10-03T08:00:12Z');

function acc(over: Partial<UserbotAccount> = {}): UserbotAccount {
  return {
    id: 'a1', firstName: 'Aziz', lastName: 'Karimov', username: 'aziz_pay',
    phoneMasked: '+998 ******* 67', status: 'ACTIVE', statusReason: null, source: 'IMPORTED',
    connectedBy: null, connectedAt: '2026-10-01T10:00:00Z', alive: true,
    lastHeartbeat: '2026-10-03T08:00:00Z', runner: 'payment', features: ['PAYMENT'], hasAvatar: false,
    ...over,
  };
}

// Button's base classes contain "disabled:" so match the real attribute only.
const DISABLED_UZISH = /<button[^>]*\sdisabled=""[^>]*>[^<]*Uzish/;

const card = (a: UserbotAccount) =>
  renderToStaticMarkup(createElement(UserbotAccountCard, { account: a, now: NOW, onDisconnect: vi.fn(), onReconnect: vi.fn() }));

describe('account card', () => {
  it('a bound account shows its feature, import source, liveness, and a disabled disconnect with the reason', () => {
    const html = card(acc());
    expect(html).toContain('Aziz Karimov');
    expect(html).toContain('@aziz_pay · +998 ******* 67');
    expect(html).toContain('PAYMENT');
    expect(html).toContain('Terminal orqali import qilingan');
    expect(html).toContain('Tirik');
    expect(html).toContain('12 soniya oldin');
    expect(html).toMatch(DISABLED_UZISH);
    expect(html).toContain("Biriktirilgan — uzib bo&#x27;lmaydi");
  });

  it('a revoked account explains why and offers reconnect', () => {
    const html = card(acc({ status: 'REVOKED', alive: false, features: [], statusReason: 'SESSION_REVOKED' }));
    expect(html).toContain('Bekor qilingan');
    expect(html).toContain('SESSION_REVOKED');
    expect(html).toContain('Qayta ulash');
  });

  it('a free active account can be disconnected', () => {
    const html = card(acc({ features: [], source: 'PANEL' }));
    expect(html).not.toMatch(DISABLED_UZISH);
    expect(html).toContain('Uzish');
    expect(html).toContain('Panel orqali ulangan');
  });

  it('a disconnected account has no disconnect button', () => {
    expect(card(acc({ status: 'DISCONNECTED', alive: false, features: [] }))).not.toContain('Uzish');
  });

  it('no hard-coded colours leak into markup', () => {
    expect(card(acc())).not.toMatch(/#[0-9a-fA-F]{6}/);
  });
});

describe('feature row', () => {
  const feature: UserbotFeature = { feature: 'PAYMENT', title: "To'lovlarni kuzatish (Humo karta)", accountId: 'a1' };

  it('lists only active accounts and marks the current one selected', () => {
    const html = renderToStaticMarkup(createElement(UserbotFeatureRow, {
      feature, onBind: vi.fn(),
      accounts: [acc(), acc({ id: 'b', firstName: 'Efbazaar', lastName: 'Post', features: [] }),
        acc({ id: 'r', firstName: 'Revoked', status: 'REVOKED', features: [] })],
    }));
    expect(html).toContain("To&#x27;lovlarni kuzatish (Humo karta)");
    expect(html).toContain('Efbazaar Post');
    expect(html).not.toContain('Revoked');
    expect(html).toMatch(/<option[^>]*value="a1"[^>]*selected/);
    expect(html).toContain('bg-card');
  });

  it('an unbound feature says so', () => {
    const html = renderToStaticMarkup(createElement(UserbotFeatureRow, {
      feature: { ...feature, accountId: null }, onBind: vi.fn(), accounts: [acc({ features: [] })],
    }));
    expect(html).toContain('Userbotni tanlang');
  });
});

describe('login dialog', () => {
  it('opens on the phone step with Uzbekistan preselected', () => {
    const html = renderToStaticMarkup(createElement(UserbotLoginDialog, { open: true, onClose: vi.fn(), onConnected: vi.fn() }));
    expect(html).toContain('role="dialog"');
    expect(html).toContain("Telegram&#x27;ga kirish");
    expect(html).toContain('+998');
    expect(html).toContain('Kodni yuborish');
  });

  it('renders nothing when closed', () => {
    expect(renderToStaticMarkup(createElement(UserbotLoginDialog, { open: false, onClose: vi.fn(), onConnected: vi.fn() }))).toBe('');
  });
});

describe('panel', () => {
  it('shows the summary, the features block and accounts in priority order', () => {
    const html = renderToStaticMarkup(createElement(UserbotPanel, {
      initialFeatures: [{ feature: 'PAYMENT', title: "To'lovlarni kuzatish (Humo karta)", accountId: 'a1' }],
      initialAccounts: [acc({ id: 'r', firstName: 'Support', status: 'REVOKED', alive: false, features: [] }), acc()],
    }));
    expect(html).toContain('Userbotlar');
    expect(html).toContain('Userbot ulash');
    expect(html).toContain('Vazifalar');
    expect(html.indexOf('Aziz Karimov')).toBeLessThan(html.indexOf('Support'));
    expect(html).toContain("E&#x27;tibor talab qiladi");
  });

  it('an empty list invites connecting the first userbot', () => {
    const html = renderToStaticMarkup(createElement(UserbotPanel, { initialAccounts: [], initialFeatures: [] }));
    expect(html).toContain('Hali userbot ulanmagan');
  });
});

// ---- behaviour (real DOM) ----

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = (el: ReturnType<typeof createElement>) => act(() => { root.render(el); });
const flush = () => act(async () => { await Promise.resolve(); });

function byText(sel: string, text: string): HTMLElement {
  const el = Array.from(document.querySelectorAll<HTMLElement>(sel)).find((e) => e.textContent?.includes(text));
  if (!el) throw new Error(`no ${sel} with text "${text}"`);
  return el;
}

const click = (el: HTMLElement) => act(async () => { el.click(); });

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string, event: 'input' | 'change') {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  return act(async () => { el.dispatchEvent(new Event(event, { bubbles: true })); });
}

describe('behaviour: login dialog', () => {
  it('after the phone is sent the code step offers "Davom etish", and closing with X cancels the login', async () => {
    vi.mocked(client.startLogin).mockResolvedValue({ loginId: 'L1', status: 'CODE_SENT', codeType: 'APP', timeoutSec: 60 });
    vi.mocked(client.cancelLogin).mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(createElement(UserbotLoginDialog, { open: true, onClose, onConnected: vi.fn() }));

    await setValue(document.querySelector('input[inputmode="tel"]')!, '+998 90 123 45 67', 'input');
    await click(byText('button', 'Kodni yuborish'));
    await flush();

    expect(client.startLogin).toHaveBeenCalledWith('+998 90 123 45 67');
    expect(document.body.textContent).toContain('Davom etish');

    await click(document.querySelector<HTMLElement>('button[aria-label="Yopish"]')!);
    expect(client.cancelLogin).toHaveBeenCalledWith('L1');
    expect(onClose).toHaveBeenCalled();
  });

  it('a gone login returns to the phone step and shows the message', async () => {
    vi.mocked(client.startLogin).mockResolvedValue({ loginId: 'L1', status: 'CODE_SENT', codeType: 'SMS', timeoutSec: 60 });
    vi.mocked(client.submitCode).mockRejectedValue(new client.UserbotApiError(410, { code: 'LOGIN_GONE', message: 'Boshidan boshlang.' }));
    render(createElement(UserbotLoginDialog, { open: true, onClose: vi.fn(), onConnected: vi.fn() }));

    await setValue(document.querySelector('input[inputmode="tel"]')!, '+998 90 123 45 67', 'input');
    await click(byText('button', 'Kodni yuborish'));
    await flush();
    await setValue(document.querySelector('input[inputmode="numeric"]')!, '12345', 'input');
    await click(byText('button', 'Davom etish'));
    await flush();

    expect(document.body.textContent).toContain('Kodni yuborish');
    expect(document.body.textContent).toContain('Boshidan boshlang.');
  });
});

describe('behaviour: account card', () => {
  it('a failed disconnect keeps the confirm dialog open and shows the server message', async () => {
    const onDisconnect = vi.fn().mockRejectedValue(new client.UserbotApiError(409, { code: 'ACCOUNT_BOUND', message: 'Bu userbot PAYMENT vazifasiga biriktirilgan.' }));
    render(createElement(UserbotAccountCard, { account: acc({ features: [], source: 'PANEL' }), now: NOW, onDisconnect, onReconnect: vi.fn() }));

    await click(byText('button', 'Uzish'));
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(dialog).not.toBeNull();
    const confirmBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Uzish')!;
    await click(confirmBtn);
    await flush();

    expect(onDisconnect).toHaveBeenCalledWith('a1');
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Bu userbot PAYMENT vazifasiga biriktirilgan.');
  });
});

describe('behaviour: feature row', () => {
  it('choosing another account asks first; cancelling does not bind and restores the select', async () => {
    const onBind = vi.fn().mockResolvedValue(undefined);
    const accounts = [acc(), acc({ id: 'b', firstName: 'Efbazaar', lastName: 'Post', features: [] })];
    render(createElement(UserbotFeatureRow, {
      feature: { feature: 'PAYMENT', title: 'T', accountId: 'a1' }, accounts, onBind,
    }));

    const select = document.querySelector('select')!;
    await setValue(select, 'b', 'change');
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();

    await click(byText('button', 'Bekor qilish'));
    expect(onBind).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.querySelector('select')!.value).toBe('a1');
  });
});
