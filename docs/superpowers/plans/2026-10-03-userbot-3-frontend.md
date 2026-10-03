# Userbot 3/3 — Frontend: Admin › Userbotlar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin panelida "Userbotlar" bo'limi: ulangan Telegram userbotlar ro'yxati (holat, vazifalar, uzish, qayta ulash), "Userbot ulash" Telegram uslubidagi login oynasi (telefon → kod → 2FA → tayyor) va "Vazifalar" bloki (PAYMENT uchun userbot tanlash, tasdiq bilan).

**Architecture:** Next.js 16 App Router. Server sahifa (`/admin/userbots`) dastlabki ma'lumotni `apiFetch('/userbot/v1/...')` bilan oladi; client panel o'sha ma'lumot bilan ochilib, har 15 s yangilaydi. Brauzer chaqiruvlari same-origin proxy `/api/userbot/[...path]` orqali (payment proxy'ning nusxasi) nginx'ning ichki `:8080` serveriga boradi, u esa `userbot-core` ga. Mantiq (holat belgilari, vaqt matni, login oqimi reducer'i) `src/lib` dagi sof funksiyalarda — ular unit testlanadi; komponentlar `renderToStaticMarkup` bilan testlanadi.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind + shadcn/ui (`Button`, `Input`), lucide-react, Vitest (+ jsdom).

**Spec:** `docs/superpowers/specs/2026-10-02-userbot-management-design.md` (§5 API, §8 Frontend)
**Design:** https://claude.ai/artifact/N98rvB47tcRDWfiqLvEH2n (kunduzgi va tungi rejim; `Main`, `Login`, `Dialogs` artboardlari)
**Backend contract:** `userbot-service/README.md` (API jadvali, xato kodlari) — 2-reja natijasi.

## Global Constraints

- Ishlash joyi: `frontend/`. Node 22, `npm ci --no-audit --no-fund`.
- Tekshiruv (AGENTS.md): `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` — hammasi yashil.
- Testlar `src/**/*.test.ts` (TSX emas): komponentlar `createElement` + `renderToStaticMarkup` bilan, kerak bo'lsa `// @vitest-environment jsdom`.
- Ranglar faqat tema token'laridan (`bg-card`, `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary text-primary-foreground`, `bg-secondary`, `bg-accent`, `text-destructive`, `bg-destructive/10` …) — hech qanday hex. Input/select har doim fon va matn rangini token'dan oladi (`Input` komponenti `bg-card text-foreground` beradi; `<select>` ga `bg-card text-foreground` qo'shing) — aks holda tungi rejimda brauzerning oq foni chiqadi.
- Matnlar o'zbekcha, dizayndagi so'zlar bilan.
- Sessiya satri, to'liq telefon (javobdan kelganini), kod, parol — `console.*` ga yoki `Error` matniga tushmaydi. Login kodi va parol faqat React state'da, oyna yopilganda tozalanadi.
- API asosiy yo'li brauzerda `/api/userbot/v1`, serverda `apiFetch('/userbot/v1/...')`.
- `package.json` o'zgarmaydi (yangi paket kerak emas). O'zgarsa — `package-lock.json` ham commit.
- Commit xabarlariga Claude imzosi / Co-Authored-By qo'shilmaydi.

## Review Focus

- `LOGIN_GONE` (TTL tugadi / urinishlar tugadi) — oyna telefon qadamiga qaytadi va xabarni ko'rsatadi, eski `loginId` bilan so'rov yubormaydi (Task 3 reducer testi).
- Oyna yopilganda (X, Escape) ochiq login backend'da `DELETE /logins/{id}` bilan bekor qilinadi — aks holda Pyrogram client 5 daqiqa ochiq turadi (Task 4 testi: cancel chaqirilgani).
- Biriktirilgan akkountning "Uzish" tugmasi o'chiq va sababi ko'rinadi; server baribir 409 qaytarsa ham xabar ko'rsatiladi (Task 4 testi).
- PAYMENT tanlovida faqat `ACTIVE` akkountlar bor; joriy akkountni qayta tanlash so'rov yubormaydi (Task 1 helper testi + Task 4).
- Proxy `..`/`.` segmentlarini rad etadi va `/api/userbot/` dan boshqa joyga yo'naltirmaydi (Task 2 testi).

---

## File Structure

```
frontend/src/
├── app/api/userbot/[...path]/route.ts        proxy (payment proxy nusxasi, upstream /userbot/)
├── app/api/userbot/[...path]/route.test.ts   yo'l himoyasi testi
├── app/admin/userbots/page.tsx               server sahifa
├── lib/userbot-types.ts                      API turlari
├── lib/userbot-view.ts (+ .test.ts)          sof ko'rinish yordamchilari
├── lib/userbot-client.ts (+ .test.ts)        brauzer API chaqiruvlari, UserbotApiError
├── lib/userbot-server.ts                     SSR o'qishlar
├── lib/userbot-login-flow.ts (+ .test.ts)    login oqimi reducer'i
└── components/admin/userbots/
    ├── confirm-dialog.tsx                    umumiy tasdiq oynasi
    ├── userbot-account-card.tsx
    ├── userbot-feature-row.tsx
    ├── userbot-login-dialog.tsx
    ├── userbot-panel.tsx                     client konteyner (holat, polling)
    └── userbots.test.ts                      render testlari
```
O'zgaradi: `components/admin/admin-shell.tsx` (nav), `frontend/README.md`.

---

### Task 1: API turlari va ko'rinish yordamchilari

**Files:**
- Create: `frontend/src/lib/userbot-types.ts`, `frontend/src/lib/userbot-view.ts`
- Test: `frontend/src/lib/userbot-view.test.ts`

**Interfaces:**
- Produces (`userbot-types.ts`):
  ```ts
  export type UserbotStatus = 'ACTIVE' | 'REVOKED' | 'DISCONNECTED';
  export interface UserbotAccount {
    id: string; firstName: string; lastName: string | null; username: string | null;
    phoneMasked: string; status: UserbotStatus; statusReason: string | null;
    source: 'PANEL' | 'IMPORTED'; connectedBy: string | null; connectedAt: string;
    alive: boolean; lastHeartbeat: string | null; runner: 'core' | 'payment' | null;
    features: string[]; hasAvatar: boolean;
  }
  export interface UserbotFeature { feature: string; title: string; accountId: string | null }
  export type LoginStatus = 'CODE_SENT' | 'PASSWORD_REQUIRED' | 'DONE';
  export interface LoginStepResponse {
    loginId: string; status: LoginStatus; codeType?: string; timeoutSec?: number;
    hint?: string | null; account?: UserbotAccount;
  }
  export interface UserbotErrorBody {
    code: string; message: string; retryAfterSec?: number; features?: string; fields?: string[];
  }
  ```
- Produces (`userbot-view.ts`):
  - `type BadgeTone = 'alive' | 'down' | 'revoked' | 'disconnected'`
  - `statusBadge(a: UserbotAccount): { label: string; tone: BadgeTone }`
  - `relativeAgo(iso: string | null, now: Date): string`
  - `initials(first: string, last: string | null): string`
  - `handleLine(a: UserbotAccount): string`
  - `sourceLabel(a: UserbotAccount): string`
  - `summarize(list: UserbotAccount[]): { total: number; alive: number; attention: number }`
  - `sortAccounts(list: UserbotAccount[]): UserbotAccount[]`
  - `bindable(list: UserbotAccount[]): UserbotAccount[]`
  - `codeDestination(codeType: string | undefined): string`
  - `sanitizeCode(raw: string): string`
  - `canReconnect(a: UserbotAccount): boolean`

- [ ] **Step 1: Yiqiluvchi testlar**

`frontend/src/lib/userbot-view.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import type { UserbotAccount } from './userbot-types';
import {
  bindable, canReconnect, codeDestination, handleLine, initials, relativeAgo,
  sanitizeCode, sortAccounts, sourceLabel, statusBadge, summarize,
} from './userbot-view';

function acc(over: Partial<UserbotAccount> = {}): UserbotAccount {
  return {
    id: 'a1', firstName: 'Aziz', lastName: 'Karimov', username: 'aziz_pay',
    phoneMasked: '+998 ******* 67', status: 'ACTIVE', statusReason: null, source: 'PANEL',
    connectedBy: null, connectedAt: '2026-10-01T10:00:00Z', alive: true,
    lastHeartbeat: '2026-10-03T08:00:00Z', runner: 'core', features: [], hasAvatar: false,
    ...over,
  };
}

const NOW = new Date('2026-10-03T08:00:12Z');

describe('statusBadge', () => {
  it('an active account with a fresh heartbeat is alive', () => {
    expect(statusBadge(acc())).toEqual({ label: 'Tirik', tone: 'alive' });
  });
  it('an active account that stopped answering is flagged, not shown as alive', () => {
    expect(statusBadge(acc({ alive: false }))).toEqual({ label: 'Javob bermayapti', tone: 'down' });
  });
  it('revoked and disconnected accounts say so', () => {
    expect(statusBadge(acc({ status: 'REVOKED', alive: false })).tone).toBe('revoked');
    expect(statusBadge(acc({ status: 'DISCONNECTED', alive: false })).label).toBe('Uzilgan');
  });
});

describe('relativeAgo', () => {
  it.each([
    ['2026-10-03T08:00:00Z', '12 soniya oldin'],
    ['2026-10-03T07:55:12Z', '5 daqiqa oldin'],
    ['2026-10-03T05:00:12Z', '3 soat oldin'],
    ['2026-10-01T08:00:12Z', '2 kun oldin'],
  ])('%s → %s', (iso, text) => {
    expect(relativeAgo(iso, NOW)).toBe(text);
  });
  it('no heartbeat yet is a dash', () => {
    expect(relativeAgo(null, NOW)).toBe('—');
  });
  it('a timestamp slightly in the future (clock skew) is "hozirgina"', () => {
    expect(relativeAgo('2026-10-03T08:00:15Z', NOW)).toBe('hozirgina');
  });
});

it('initials use first letters, upper-cased, and survive a missing last name', () => {
  expect(initials('aziz', 'karimov')).toBe('AK');
  expect(initials('Support', null)).toBe('S');
  expect(initials('', null)).toBe('?');
});

it('the handle line hides nothing more than the masked phone', () => {
  expect(handleLine(acc())).toBe('@aziz_pay · +998 ******* 67');
  expect(handleLine(acc({ username: null }))).toBe('+998 ******* 67');
});

it('source label tells the terminal import apart', () => {
  expect(sourceLabel(acc({ source: 'IMPORTED' }))).toBe('Terminal orqali import qilingan');
  expect(sourceLabel(acc())).toBe('Panel orqali ulangan');
});

it('summary counts revoked and silent active accounts as needing attention', () => {
  expect(summarize([
    acc(), acc({ id: 'b', alive: false }), acc({ id: 'c', status: 'REVOKED', alive: false }),
    acc({ id: 'd', status: 'DISCONNECTED', alive: false }),
  ])).toEqual({ total: 4, alive: 1, attention: 2 });
});

it('bound accounts come first, then active, revoked, disconnected', () => {
  const list = sortAccounts([
    acc({ id: 'disc', status: 'DISCONNECTED' }),
    acc({ id: 'rev', status: 'REVOKED' }),
    acc({ id: 'free' }),
    acc({ id: 'pay', features: ['PAYMENT'] }),
  ]);
  expect(list.map((a) => a.id)).toEqual(['pay', 'free', 'rev', 'disc']);
});

it('only active accounts can be bound to a feature', () => {
  expect(bindable([acc(), acc({ id: 'r', status: 'REVOKED' })]).map((a) => a.id)).toEqual(['a1']);
});

it('reconnect is offered for revoked and disconnected accounts only', () => {
  expect(canReconnect(acc())).toBe(false);
  expect(canReconnect(acc({ status: 'REVOKED' }))).toBe(true);
  expect(canReconnect(acc({ status: 'DISCONNECTED' }))).toBe(true);
});

it.each([
  ['APP', 'Telegram ilovangizga'], ['SMS', 'SMS orqali'], ['CALL', "qo'ng'iroq orqali"],
  ['FLASH_CALL', "qo'ng'iroq orqali"], ['EMAIL_CODE', 'emailingizga'], [undefined, "Telegram'ga"],
])('code destination %s', (type, text) => {
  expect(codeDestination(type)).toBe(text);
});

it('the code field keeps digits only, at most six', () => {
  expect(sanitizeCode(' 12-34 5a678 ')).toBe('123456');
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `cd frontend && npx vitest run src/lib/userbot-view.test.ts`
Expected: FAIL — `Cannot find module './userbot-view'`.

- [ ] **Step 3: Amalga oshirish**

`frontend/src/lib/userbot-types.ts` — Interfaces'dagi turlar, har birining ustida bir qatorli izoh (`userbot-service/README.md` dagi API'ning shakli).

`frontend/src/lib/userbot-view.ts`:
```ts
import type { UserbotAccount } from './userbot-types';

export type BadgeTone = 'alive' | 'down' | 'revoked' | 'disconnected';

export function statusBadge(a: UserbotAccount): { label: string; tone: BadgeTone } {
  if (a.status === 'REVOKED') return { label: 'Bekor qilingan', tone: 'revoked' };
  if (a.status === 'DISCONNECTED') return { label: 'Uzilgan', tone: 'disconnected' };
  return a.alive ? { label: 'Tirik', tone: 'alive' } : { label: 'Javob bermayapti', tone: 'down' };
}

export function relativeAgo(iso: string | null, now: Date): string {
  if (!iso) return '—';
  const sec = Math.floor((now.getTime() - new Date(iso).getTime()) / 1000);
  if (sec < 1) return 'hozirgina';
  if (sec < 60) return `${sec} soniya oldin`;
  if (sec < 3600) return `${Math.floor(sec / 60)} daqiqa oldin`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} soat oldin`;
  return `${Math.floor(sec / 86400)} kun oldin`;
}

export function initials(first: string, last: string | null): string {
  const s = `${first.trim().charAt(0)}${(last ?? '').trim().charAt(0)}`.toUpperCase();
  return s || '?';
}

export function handleLine(a: UserbotAccount): string {
  return a.username ? `@${a.username} · ${a.phoneMasked}` : a.phoneMasked;
}

export function sourceLabel(a: UserbotAccount): string {
  return a.source === 'IMPORTED' ? 'Terminal orqali import qilingan' : 'Panel orqali ulangan';
}

export function summarize(list: UserbotAccount[]) {
  return {
    total: list.length,
    alive: list.filter((a) => a.status === 'ACTIVE' && a.alive).length,
    attention: list.filter((a) => a.status === 'REVOKED' || (a.status === 'ACTIVE' && !a.alive)).length,
  };
}

function rank(a: UserbotAccount): number {
  if (a.status === 'ACTIVE' && a.features.length > 0) return 0;
  if (a.status === 'ACTIVE') return 1;
  if (a.status === 'REVOKED') return 2;
  return 3;
}

export function sortAccounts(list: UserbotAccount[]): UserbotAccount[] {
  return [...list].sort((x, y) => rank(x) - rank(y) || x.connectedAt.localeCompare(y.connectedAt));
}

export function bindable(list: UserbotAccount[]): UserbotAccount[] {
  return list.filter((a) => a.status === 'ACTIVE');
}

export function canReconnect(a: UserbotAccount): boolean {
  return a.status === 'REVOKED' || a.status === 'DISCONNECTED';
}

export function codeDestination(codeType: string | undefined): string {
  switch (codeType) {
    case 'APP': return 'Telegram ilovangizga';
    case 'SMS': case 'FRAGMENT_SMS': return 'SMS orqali';
    case 'CALL': case 'FLASH_CALL': case 'MISSED_CALL': return "qo'ng'iroq orqali";
    case 'EMAIL_CODE': return 'emailingizga';
    default: return "Telegram'ga";
  }
}

export function sanitizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}
```

- [ ] **Step 4: O'tishini tekshirish**

Run: `npx vitest run src/lib/userbot-view.test.ts` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/userbot-types.ts frontend/src/lib/userbot-view.ts frontend/src/lib/userbot-view.test.ts
git commit -m "feat(frontend): userbot API turlari va ko'rinish yordamchilari"
```

---

### Task 2: Proxy, brauzer client va SSR o'qishlar

**Files:**
- Create: `frontend/src/app/api/userbot/[...path]/route.ts`, `route.test.ts`
- Create: `frontend/src/lib/userbot-client.ts`, `userbot-client.test.ts`, `frontend/src/lib/userbot-server.ts`

**Interfaces:**
- Consumes: Task 1 turlari.
- Produces (`userbot-client.ts`, `'use client'`):
  - `class UserbotApiError extends Error { status: number; code: string; retryAfterSec?: number }`
  - `listAccounts(): Promise<UserbotAccount[]>`, `listFeatures(): Promise<UserbotFeature[]>`
  - `startLogin(phone: string): Promise<LoginStepResponse>`, `submitCode(loginId, code)`, `submitPassword(loginId, password)`, `resendCode(loginId)` → `Promise<LoginStepResponse>`; `cancelLogin(loginId): Promise<void>`
  - `disconnectAccount(id: string): Promise<void>`, `bindFeature(feature: string, accountId: string): Promise<UserbotFeature>`
  - `avatarUrl(id: string): string`
- Produces (`userbot-server.ts`, `'server-only'`): `listUserbotAccountsSSR(): Promise<UserbotAccount[] | null>`, `listUserbotFeaturesSSR(): Promise<UserbotFeature[] | null>`.

- [ ] **Step 1: Yiqiluvchi testlar**

`frontend/src/lib/userbot-client.test.ts`:
```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  UserbotApiError, avatarUrl, bindFeature, cancelLogin, startLogin, submitPassword,
} from './userbot-client';

function respond(status: number, body?: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('userbot client', () => {
  it('posts the phone to the login endpoint through the same-origin proxy', async () => {
    const fetchMock = respond(200, { loginId: 'L1', status: 'CODE_SENT', codeType: 'APP', timeoutSec: 60 });
    vi.stubGlobal('fetch', fetchMock);

    const step = await startLogin('+998901234567');

    expect(step.loginId).toBe('L1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/userbot/v1/logins');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ phone: '+998901234567' });
  });

  it('turns the service error shape into a typed error with the Uzbek message', async () => {
    vi.stubGlobal('fetch', respond(429, { code: 'FLOOD_WAIT', message: '42 soniyadan keyin', retryAfterSec: 42 }));
    const err = await submitPassword('L1', 'pw').catch((e) => e);
    expect(err).toBeInstanceOf(UserbotApiError);
    expect(err).toMatchObject({ status: 429, code: 'FLOOD_WAIT', retryAfterSec: 42, message: '42 soniyadan keyin' });
  });

  it('a proxy 502 without a code still yields a readable error', async () => {
    vi.stubGlobal('fetch', respond(502, { message: 'Userbot API unreachable' }));
    const err = await bindFeature('PAYMENT', 'a1').catch((e) => e);
    expect(err).toMatchObject({ status: 502, code: 'HTTP_502' });
  });

  it('the password never appears in a thrown error', async () => {
    vi.stubGlobal('fetch', respond(400, { code: 'PASSWORD_INVALID', message: "Parol noto'g'ri." }));
    const err = await submitPassword('L1', 'hunter2-secret').catch((e) => e);
    expect(String(err)).not.toContain('hunter2-secret');
  });

  it('cancel and disconnect accept 204', async () => {
    vi.stubGlobal('fetch', respond(204));
    await expect(cancelLogin('L1')).resolves.toBeUndefined();
  });

  it('ids are encoded into the path', () => {
    expect(avatarUrl('a/../b')).toBe('/api/userbot/v1/accounts/a%2F..%2Fb/avatar');
  });
});
```

`frontend/src/app/api/userbot/[...path]/route.test.ts`:
```ts
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

function call(path: string[]) {
  return GET(new NextRequest(`http://localhost/api/userbot/${path.join('/')}`), {
    params: Promise.resolve({ path }),
  });
}

describe('userbot proxy', () => {
  it('forwards to internal nginx under /userbot/', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await call(['v1', 'accounts']);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/userbot\/v1\/accounts$/);
  });

  it.each([[['v1', '..', 'admin']], [['.', 'x']], [[]]])('rejects path %j', async (path) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await call(path);
    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```
(`route.ts` qaysi metodlarni eksport qilishini payment proxy'dan ko'ring; nomlar mos kelmasa testni moslang, assertion'lar qolsin.)

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npx vitest run src/lib/userbot-client.test.ts "src/app/api/userbot"` — Expected: FAIL (modullar yo'q).

- [ ] **Step 3: Proxy**

`frontend/src/app/api/userbot/[...path]/route.ts` — `src/app/api/payment/[...path]/route.ts` ning to'liq nusxasi, uchta farq bilan: izohdagi servis nomi (`userbot-core`, `/api/userbot/v1/...` → nginx `/userbot/` ni olib tashlaydi → `/api/v1/...`), `upstreamUrl = \`${INTERNAL_BASE}/userbot/${targetPath}${query}\``, 502 xabari `'Userbot API unreachable'`. Eksport qilinadigan metodlar payment proxy'dagidek (GET/POST/PUT/DELETE …).

- [ ] **Step 4: Client va SSR**

`frontend/src/lib/userbot-client.ts`:
```ts
'use client';

import type { LoginStepResponse, UserbotAccount, UserbotErrorBody, UserbotFeature } from './userbot-types';

/**
 * Browser-side calls to userbot-core through the same-origin proxy
 * (`/api/userbot/[...path]`), which attaches the httpOnly access cookie.
 * The service itself checks ROLE_ADMIN. Login codes and passwords travel only
 * in request bodies — never into an Error, a log or the URL.
 */
const BASE = '/api/userbot/v1';

export class UserbotApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSec?: number;

  constructor(status: number, body: Partial<UserbotErrorBody>) {
    super(body.message || `So'rov bajarilmadi (${status})`);
    this.name = 'UserbotApiError';
    this.status = status;
    this.code = body.code || `HTTP_${status}`;
    this.retryAfterSec = body.retryAfterSec;
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Partial<UserbotErrorBody>;
    throw new UserbotApiError(res.status, body);
  }
  return (await res.json()) as T;
}

const id = (v: string) => encodeURIComponent(v);
const post = (body?: unknown): RequestInit => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export const listAccounts = () => call<UserbotAccount[]>('/accounts');
export const listFeatures = () => call<UserbotFeature[]>('/features');
export const startLogin = (phone: string) => call<LoginStepResponse>('/logins', post({ phone }));
export const submitCode = (loginId: string, code: string) =>
  call<LoginStepResponse>(`/logins/${id(loginId)}/code`, post({ code }));
export const submitPassword = (loginId: string, password: string) =>
  call<LoginStepResponse>(`/logins/${id(loginId)}/password`, post({ password }));
export const resendCode = (loginId: string) => call<LoginStepResponse>(`/logins/${id(loginId)}/resend`, post());
export const cancelLogin = (loginId: string) => call<void>(`/logins/${id(loginId)}`, { method: 'DELETE' });
export const disconnectAccount = (accountId: string) =>
  call<void>(`/accounts/${id(accountId)}`, { method: 'DELETE' });
export const bindFeature = (feature: string, accountId: string) =>
  call<UserbotFeature>(`/features/${id(feature)}`, { method: 'PUT', body: JSON.stringify({ accountId }) });
export const avatarUrl = (accountId: string) => `${BASE}/accounts/${id(accountId)}/avatar`;
```

`frontend/src/lib/userbot-server.ts` — `payment-admin-server.ts` uslubida: `import 'server-only'`, `PREFIX = '/userbot/v1'`, `report()` faqat status/kod log qiladi, ikkala funksiya xatoda `null` qaytaradi.

- [ ] **Step 5: O'tishini tekshirish**

Run: `npx vitest run src/lib/userbot-client.test.ts "src/app/api/userbot"` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/api/userbot frontend/src/lib/userbot-client.ts frontend/src/lib/userbot-client.test.ts frontend/src/lib/userbot-server.ts
git commit -m "feat(frontend): userbot proxy, brauzer client va SSR o'qishlar"
```

---

### Task 3: Login oqimi reducer'i

**Files:**
- Create: `frontend/src/lib/userbot-login-flow.ts`, `userbot-login-flow.test.ts`

**Interfaces:**
- Consumes: `LoginStepResponse`, `UserbotAccount`, `UserbotApiError` (faqat `code`, `message`, `retryAfterSec` maydonlari kerak — reducer `{code, message}` obyektini oladi, klassga bog'lanmaydi).
- Produces:
  ```ts
  export type LoginStep = 'phone' | 'code' | 'password' | 'done';
  export interface LoginState {
    step: LoginStep; loginId: string | null; codeType?: string; resendAt: number | null;
    hint: string | null; account: UserbotAccount | null; error: string | null; busy: boolean;
  }
  export type LoginAction =
    | { type: 'submit' }
    | { type: 'response'; res: LoginStepResponse; now: number }
    | { type: 'failure'; error: { code: string; message: string } }
    | { type: 'back' } | { type: 'reset' };
  export const initialLogin: LoginState;
  export function loginReducer(s: LoginState, a: LoginAction): LoginState;
  export function resendSecondsLeft(s: LoginState, now: number): number;
  ```

- [ ] **Step 1: Yiqiluvchi testlar**

`frontend/src/lib/userbot-login-flow.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

import { initialLogin, loginReducer, resendSecondsLeft } from './userbot-login-flow';

const T0 = 1_000_000;

describe('login flow', () => {
  it('phone → code: keeps the login id, the delivery and when resend unlocks', () => {
    const s = loginReducer(loginReducer(initialLogin, { type: 'submit' }), {
      type: 'response', now: T0, res: { loginId: 'L1', status: 'CODE_SENT', codeType: 'APP', timeoutSec: 60 },
    });
    expect(s).toMatchObject({ step: 'code', loginId: 'L1', codeType: 'APP', busy: false, error: null });
    expect(resendSecondsLeft(s, T0 + 18_000)).toBe(42);
    expect(resendSecondsLeft(s, T0 + 61_000)).toBe(0);
  });

  it('code → password carries the hint', () => {
    const atCode = { ...initialLogin, step: 'code' as const, loginId: 'L1' };
    const s = loginReducer(atCode, { type: 'response', now: T0, res: { loginId: 'L1', status: 'PASSWORD_REQUIRED', hint: 'mushuk' } });
    expect(s).toMatchObject({ step: 'password', hint: 'mushuk' });
  });

  it('DONE shows the connected account', () => {
    const account = { id: 'a1' } as never;
    const s = loginReducer({ ...initialLogin, step: 'password', loginId: 'L1' }, {
      type: 'response', now: T0, res: { loginId: 'L1', status: 'DONE', account },
    });
    expect(s).toMatchObject({ step: 'done', account, loginId: null });
  });

  it('a wrong code stays on the step and shows the message', () => {
    const s = loginReducer({ ...initialLogin, step: 'code', loginId: 'L1', busy: true }, {
      type: 'failure', error: { code: 'CODE_INVALID', message: "Kod noto'g'ri." },
    });
    expect(s).toMatchObject({ step: 'code', loginId: 'L1', busy: false, error: "Kod noto'g'ri." });
  });

  it.each(['LOGIN_GONE', 'CODE_EXPIRED'])('%s starts over from the phone and forgets the login id', (code) => {
    const s = loginReducer({ ...initialLogin, step: 'password', loginId: 'L1' }, {
      type: 'failure', error: { code, message: 'Boshidan boshlang.' },
    });
    expect(s).toMatchObject({ step: 'phone', loginId: null, error: 'Boshidan boshlang.' });
  });

  it('back from code returns to the phone step and drops the login id', () => {
    const s = loginReducer({ ...initialLogin, step: 'code', loginId: 'L1' }, { type: 'back' });
    expect(s).toMatchObject({ step: 'phone', loginId: null });
  });

  it('reset clears everything', () => {
    expect(loginReducer({ ...initialLogin, step: 'done', error: 'x' }, { type: 'reset' })).toEqual(initialLogin);
  });
});
```

- [ ] **Step 2: Yiqilishini tekshirish**

Run: `npx vitest run src/lib/userbot-login-flow.test.ts` — Expected: FAIL (modul yo'q).

- [ ] **Step 3: Amalga oshirish**

`frontend/src/lib/userbot-login-flow.ts`:
```ts
import type { LoginStepResponse, UserbotAccount } from './userbot-types';

/**
 * The login dialog's state machine, kept pure so every transition is tested
 * without a browser. Codes and passwords are not in here — the inputs own them.
 * "back" and the start-over errors drop the login id: the service has either
 * forgotten it or the dialog is about to cancel it, and an old id must never be
 * sent again.
 */
export type LoginStep = 'phone' | 'code' | 'password' | 'done';

export interface LoginState {
  step: LoginStep;
  loginId: string | null;
  codeType?: string;
  resendAt: number | null;
  hint: string | null;
  account: UserbotAccount | null;
  error: string | null;
  busy: boolean;
}

export type LoginAction =
  | { type: 'submit' }
  | { type: 'response'; res: LoginStepResponse; now: number }
  | { type: 'failure'; error: { code: string; message: string } }
  | { type: 'back' }
  | { type: 'reset' };

export const initialLogin: LoginState = {
  step: 'phone', loginId: null, codeType: undefined, resendAt: null,
  hint: null, account: null, error: null, busy: false,
};

const START_OVER = new Set(['LOGIN_GONE', 'CODE_EXPIRED']);

export function loginReducer(s: LoginState, a: LoginAction): LoginState {
  switch (a.type) {
    case 'submit':
      return { ...s, busy: true, error: null };
    case 'response': {
      const { res, now } = a;
      if (res.status === 'CODE_SENT') {
        return {
          ...s, step: 'code', loginId: res.loginId, codeType: res.codeType, busy: false, error: null,
          resendAt: res.timeoutSec ? now + res.timeoutSec * 1000 : null,
        };
      }
      if (res.status === 'PASSWORD_REQUIRED') {
        return { ...s, step: 'password', loginId: res.loginId, hint: res.hint ?? null, busy: false, error: null };
      }
      return { ...initialLogin, step: 'done', account: res.account ?? null };
    }
    case 'failure':
      if (START_OVER.has(a.error.code)) return { ...initialLogin, error: a.error.message };
      return { ...s, busy: false, error: a.error.message };
    case 'back':
      return { ...initialLogin };
    case 'reset':
      return initialLogin;
  }
}

export function resendSecondsLeft(s: LoginState, now: number): number {
  if (s.resendAt === null) return 0;
  return Math.max(0, Math.ceil((s.resendAt - now) / 1000));
}
```

- [ ] **Step 4: O'tishini tekshirish** — `npx vitest run src/lib/userbot-login-flow.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/userbot-login-flow.ts frontend/src/lib/userbot-login-flow.test.ts
git commit -m "feat(frontend): userbot login oqimi reducer'i"
```

---

### Task 4: Komponentlar

**Files:**
- Create: `frontend/src/components/admin/userbots/confirm-dialog.tsx`, `userbot-account-card.tsx`, `userbot-feature-row.tsx`, `userbot-login-dialog.tsx`, `userbot-panel.tsx`
- Test: `frontend/src/components/admin/userbots/userbots.test.ts`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `ConfirmDialog({ open, title, body, confirmLabel, destructive?, busy?, error?, onConfirm, onCancel })` — `role="dialog"`, `aria-modal`, `aria-labelledby`; Escape va fon bosilishi `onCancel`; ochilganda tasdiq tugmasiga fokus.
  - `UserbotAccountCard({ account, now, onDisconnect, onReconnect })`
  - `UserbotFeatureRow({ feature, accounts, onBind })` — `onBind(accountId): Promise<void>`
  - `UserbotLoginDialog({ open, onClose, onConnected })`
  - `UserbotPanel({ initialAccounts, initialFeatures })` — `'use client'`, 15 s polling (`document.visibilityState === 'visible'` bo'lganda), `refresh()` har amaldan keyin.

Dizayn (artboard `Main`, `Login`, `Dialogs`) bo'yicha; ranglar faqat token'lar orqali. Holat belgilari: `alive` → `bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`, `down` → `bg-amber-500/15 text-amber-800 dark:text-amber-300`, `revoked` → `bg-destructive/10 text-destructive`, `disconnected` → `bg-muted text-muted-foreground` (emerald/amber Tailwind palitrasi — loyihada `globals.css` da success token yo'q; boshqa joylarda shunday ishlatilganini `grep -rn "emerald-" src/components | head` bilan tekshiring va o'sha naqshga ergashing). Vazifa chipi `PAYMENT`: `bg-primary/10 text-primary`. Asosiy tugma: `Button` (default = `bg-primary text-primary-foreground`). Avatar: `hasAvatar` bo'lsa `<img src={avatarUrl(id)} alt="">`, aks holda `initials()` doirasi `bg-primary text-primary-foreground`.

- [ ] **Step 1: Yiqiluvchi render testlari**

`frontend/src/components/admin/userbots/userbots.test.ts`:
```ts
// @vitest-environment jsdom

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { UserbotAccount, UserbotFeature } from '@/lib/userbot-types';
import { UserbotAccountCard } from './userbot-account-card';
import { UserbotFeatureRow } from './userbot-feature-row';
import { UserbotLoginDialog } from './userbot-login-dialog';
import { UserbotPanel } from './userbot-panel';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

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
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*Uzish/);
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
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*Uzish/);
    expect(html).toContain('Panel orqali ulangan');
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
```
(Interaktiv xatti-harakatlar — tasdiq oynasi, `cancelLogin` chaqiruvi, 409 xabari — Step 5 dagi qo'shimcha testlarda.)

- [ ] **Step 2: Yiqilishini tekshirish** — `npx vitest run src/components/admin/userbots` → FAIL (modullar yo'q).

- [ ] **Step 3: Komponentlarni yozish**

Har bir komponent `'use client'` (panel, login, feature row, confirm, card — card ham handler oladi). Talablar:

`confirm-dialog.tsx`: `open` false → `null`. Overlay `fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4`; panel `bg-card text-card-foreground rounded-2xl p-6 w-full max-w-md shadow-xl`; sarlavha `h2#id`; body; `error` bo'lsa `text-destructive text-sm`; tugmalar: "Bekor qilish" (`variant="outline"`) va tasdiq (`destructive` bo'lsa `variant="destructive"`, aks holda default), `busy` da tasdiq tugmasi `disabled` va `Loader2` aylanadi. `useEffect` bilan Escape tinglanadi va tasdiq tugmasiga fokus.

`userbot-account-card.tsx`: dizayndagi kartadek — avatar (holat nuqtasi bilan), ism (`firstName lastName`), `handleLine`, holat belgisi (`statusBadge`), chiplar: har bir `features` elementi + `sourceLabel`; `REVOKED`/`DISCONNECTED` uchun `statusReason` qutisi (`bg-destructive/10 text-destructive`, matn: "Sessiya Telegram'da yopilgan ({reason}). Qayta ulang." — reason bo'lmasa qavssiz); `dl`: "Oxirgi signal" → `relativeAgo(lastHeartbeat, now)`, "Ishlayapti" → `runner === 'payment' ? 'userbot-payment' : runner === 'core' ? 'userbot-core' : '—'`; amallar: `canReconnect` bo'lsa "Qayta ulash" (default Button) → `onReconnect(account)`; "Uzish" (`variant="outline"` + `text-destructive`) — `features.length > 0` bo'lsa `disabled` va yonida "Biriktirilgan — uzib bo'lmaydi"; `DISCONNECTED` uchun "Uzish" ko'rsatilmaydi. "Uzish" bosilsa `ConfirmDialog` ochiladi (sarlavha "{ism}'ni uzish", matn dizayndagi), tasdiqda `await onDisconnect(account.id)`; xato bo'lsa (`UserbotApiError.message`) oynada ko'rsatiladi.

`userbot-feature-row.tsx`: dizayndagi qator — ikonka (`CreditCard` lucide), sarlavha + `feature.feature` chipi, tavsif (`PAYMENT` uchun "Humo bot chatini kuzatadi va kartalarga tushgan pulni hamyonlarga yozadi."; boshqalar uchun bo'sh), `label` + `<select className="... bg-card text-foreground border-input ...">`; birinchi option `value=""` "Userbotni tanlang" (`disabled`, faqat `accountId` null bo'lganda tanlangan); qolganlari `bindable(accounts)`. Boshqasi tanlansa `ConfirmDialog` (dizayndagi "PAYMENT vazifasini o'tkazish" matni, joriy va yangi ism bilan; joriy yo'q bo'lsa "To'lovlarni kuzatish {yangi} ga biriktiriladi."); tasdiqda `await onBind(newId)`, xato oynada; bekor qilinsa select avvalgi qiymatiga qaytadi. Joriyning o'zi tanlansa hech narsa qilmaydi.

`userbot-login-dialog.tsx`: `open` false → `null`. `useReducer(loginReducer, initialLogin)`. Qadamlar dizayndagi `Login` artboard'i bo'yicha (progress chiziqlari, Telegram belgisi `Send` lucide ikonka, sarlavhalar, matnlar). Telefon qadami: "Mamlakat" qatori (O'zbekiston, +998 — faqat ko'rinish), `Input` `inputMode="tel"` default qiymat `+998 `, "Kodni yuborish". Kod qadami: raqam, `codeDestination(codeType)` bilan "Kodni shu akkount ochiq turgan {..} yubordik.", "Raqamni o'zgartirish" (→ `back` + `cancelLogin`), bitta `Input` `inputMode="numeric" autoComplete="one-time-code"` qiymati `sanitizeCode` dan o'tadi (dizayndagi 5 katak — bitta input'ni `tracking-[0.6em] text-center text-2xl` bilan ko'rsatish yetarli), qayta yuborish taymeri (`resendSecondsLeft`, har soniya `setInterval` bilan yangilanadi; 0 da "Kodni qayta yuborish" tugmasi → `resendCode`), "Davom etish" (kod 5+ raqam bo'lganda faol). Parol qadami: `Input type={show ? 'text' : 'password'}`, ko'rsatish/yashirish `aria-label` li ikonka tugmasi, `hint` bo'lsa "Eslatma: {hint}", "Kirish". Tayyor qadami: akkount kartochkasi (avatar/ism/`handleLine`) va "Tayyor" → `onConnected()` + yopish. Har bir so'rov: `dispatch({type:'submit'})` → API → `response` yoki `failure` (`UserbotApiError` → `{code, message}`; boshqa xato → `{code:'NETWORK', message:"Tarmoq xatosi. Qayta urinib ko'ring."}`). Xato matni input ostida `text-destructive`. Yopish (X, Escape, "Tayyor"dan tashqari): `loginId` bo'lsa `cancelLogin(loginId).catch(() => {})` chaqiriladi, so'ng kod/parol state'i tozalanadi va `reset`. `busy` paytida tugmalar `disabled`. Panel `bg-card text-card-foreground rounded-3xl w-full max-w-[440px]`.

`userbot-panel.tsx`: state `accounts`, `features`, `loginOpen`, `toast` (oddiy matn, 4 s). `refresh = async () => { const [a, f] = await Promise.all([listAccounts(), listFeatures()]); ... }` (xatoda eski ma'lumot qoladi, sarlavha ostida kichik "Yangilab bo'lmadi" yozuvi). `useEffect` — 15 s interval, faqat `document.visibilityState === 'visible'`. `now` har 5 s yangilanadi (relativeAgo uchun). Tuzilma dizayndagidek: sarlavha bloki ("Admin panel › Integratsiyalar", h1 "Userbotlar", tavsif, "Userbot ulash" tugmasi `Plus` ikonka bilan), uchta statistik karta (`summarize`: "Ulangan userbotlar", "Tirik", "E'tibor talab qiladi"), "Vazifalar" bo'limi (har bir `features` uchun `UserbotFeatureRow`, `onBind = (id) => bindFeature(f.feature, id).then(refresh)`) va ostida "Kanalga post va support avto-javob vazifalari keyingi bosqichda qo'shiladi." eslatmasi, "Ulangan akkountlar" bo'limi — `sortAccounts(accounts)` grid (`grid gap-4 sm:grid-cols-2 xl:grid-cols-3`); bo'sh bo'lsa "Hali userbot ulanmagan" + "Userbot ulash" tugmasi. `onDisconnect = (id) => disconnectAccount(id).then(refresh)`, `onReconnect` login oynasini ochadi. Login `onConnected` → `refresh()`.

- [ ] **Step 4: O'tishini tekshirish** — `npx vitest run src/components/admin/userbots` → PASS.

- [ ] **Step 5: Xatti-harakat testlari (yiqiluvchi → o'tuvchi)**

Shu faylga jsdom'da React'ni haqiqiy render qiladigan testlar (`react-dom/client` `createRoot` + `act` from `react`), `@/lib/userbot-client` ni `vi.mock` bilan almashtirib:
1. Login: telefon yuborilgach (`startLogin` mock `CODE_SENT` qaytaradi) "Davom etish" ko'rinadi; oyna X bilan yopilsa `cancelLogin('L1')` chaqiriladi.
2. Login: `submitCode` mock `UserbotApiError(410, {code:'LOGIN_GONE', message:'Boshidan boshlang.'})` tashlasa — telefon qadamiga qaytadi va xabar ko'rinadi.
3. Karta: biriktirilmagan akkountda "Uzish" → tasdiq oynasi → tasdiq → `onDisconnect` mock `UserbotApiError(409, {code:'ACCOUNT_BOUND', message:'Bu userbot PAYMENT …'})` tashlasa xabar oynada ko'rinadi.
4. Feature row: boshqa akkount tanlansa tasdiq oynasi chiqadi; "Bekor qilish" bosilsa `onBind` chaqirilmaydi va select avvalgi qiymatda.
Avval testlarni yozing, ular hozirgi kodda (agar biror xatti-harakat yetishmasa) yiqilishini ko'ring, kerak bo'lsa kodni tuzating.

Run: `npx vitest run src/components/admin/userbots` → PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/admin/userbots
git commit -m "feat(frontend): userbotlar paneli — kartalar, vazifalar, Telegram login oynasi"
```

---

### Task 5: Sahifa, navigatsiya, README va to'liq tekshiruv

**Files:**
- Create: `frontend/src/app/admin/userbots/page.tsx`
- Modify: `frontend/src/components/admin/admin-shell.tsx` (nav), `frontend/src/components/admin/admin-shell.test.ts` (agar sahifalar ro'yxati qat'iy bo'lsa), `frontend/README.md`

- [ ] **Step 1: Nav testi yiqilsin**

`admin-shell.test.ts` dagi mavjud naqsh (har bir nav href uchun sahifa mavjudligi) — nav'ga `/admin/userbots` qo'shilgach sahifa bo'lmasa yiqiladi. Avval `admin-shell.tsx` dagi `system` guruhiga qo'shing:
```ts
      {
        href: '/admin/userbots',
        label: 'Userbotlar (Telegram)',
        shortLabel: 'Userbotlar',
        icon: Send,
      },
```
(`Send` ni lucide importiga qo'shing.) Run: `npx vitest run src/components/admin/admin-shell.test.ts` → FAIL (sahifa fayli yo'q) — agar test bunday tekshirmasa, `/admin/userbots` uchun breadcrumb testini qo'shing (`getActiveBreadcrumbs('/admin/userbots')` "Userbotlar (Telegram)" ni qaytaradi) va uning yiqilishini ko'ring.

- [ ] **Step 2: Sahifa**

`frontend/src/app/admin/userbots/page.tsx`:
```tsx
import { UserbotPanel } from '@/components/admin/userbots/userbot-panel';
import { listUserbotAccountsSSR, listUserbotFeaturesSSR } from '@/lib/userbot-server';

/**
 * Telegram userbot accounts and the jobs they are bound to. The admin gate and
 * `force-dynamic` come from `src/app/admin/layout.tsx`; userbot-core itself
 * checks ROLE_ADMIN again.
 */
export default async function AdminUserbotsPage() {
  const [accounts, features] = await Promise.all([listUserbotAccountsSSR(), listUserbotFeaturesSSR()]);
  if (!accounts || !features) {
    return (
      <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm font-semibold text-destructive">
        Userbot servisidan ma&apos;lumot olib bo&apos;lmadi. Sahifani yangilab ko&apos;ring.
      </p>
    );
  }
  return <UserbotPanel initialAccounts={accounts} initialFeatures={features} />;
}
```
Run: `npx vitest run src/components/admin/admin-shell.test.ts` → PASS.

- [ ] **Step 3: README**

`frontend/README.md`: `src/app/api/` qatoridagi proxy'lar ro'yxatiga `userbot` qo'shing; admin bo'limlari ro'yxati bo'lsa — "`/admin/userbots` — Telegram userbotlar: ulash (telefon → kod → 2FA), holat, uzish, vazifaga biriktirish (userbot-core `/api/userbot/v1`)".

- [ ] **Step 4: To'liq tekshiruv (AGENTS.md)**

```bash
cd frontend
npm ci --no-audit --no-fund
npm run typecheck
npm run lint
npm test
npm run build
cd .. && git diff --check
```
Expected: hammasi yashil; `npm test` da skipped 0. `git status` da `package-lock.json` o'zgarmagan.

- [ ] **Step 5: Commit**

```bash
git add frontend
git commit -m "feat(frontend): /admin/userbots sahifasi, navigatsiya va README"
```
