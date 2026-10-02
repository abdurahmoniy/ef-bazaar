# Recommendation C — frontend tablar va recommendation-service'ga ulash Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bozor sahifasida "Mening qiziqishlarim" (default, login qilganlarga) va "Katta bozor" tablari; player filtri, e'lon sahifasidagi moslik, dream team, card interest va admin talab sonlari `recommendation-service` ga ulanadi.

**Architecture:** Bitta izomorf yuklovchi (`loadMarketplacePage`) rejimni tanlaydi — player filtri bor bo'lsa `match`, aks holda tab bo'yicha `mine` (rec `/feed` → marketplace `/listings/ranked` → rec `/feed/details`) yoki `market` (marketplace `/listings?sort=valueScore,desc`). Transport ikki xil: server (`apiFetch` → `nginx:8080`) va brauzer (`/api/marketplace`, `/api/rec` same-origin proxy). Shu yuklovchi SSR birinchi sahifa va mobil "yana yuklash" uchun bir xil ishlatiladi; lenta snapshot hash'i URL'da (`feed=`) va mobil holatda yuradi.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Vitest 4, Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-30-recommendation-service-design.md` (§6, §7-bosqich 3, §8, §9 "frontend"). B bosqichi: `docs/superpowers/plans/2026-10-01-recommendation-b-service.md` (API shakllari).

## Global Constraints

- Frontend tekshiruvi (AGENTS.md): `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`. Targeted Vitest to'liq suite'ni almashtirmaydi; testlar build'ni almashtirmaydi.
- `package.json` o'zgarsa `package-lock.json` ham commit qilinadi (bu rejada yangi paket YO'Q).
- recommendation API (B): `GET /api/rec/v1/feed[?profileHash=]` → `{ empty, profileHash, ids }`; `GET /api/rec/v1/feed/details?ids=..` → `{ [id]: MatchDetails }` (≤100); `GET /api/rec/v1/match?matchCard=..&matchStrictness=..` → `{ ids }`; `GET /api/rec/v1/match/details?ids=..&matchCard=..` → `{ [id]: MatchDetails }`; `GET /api/rec/v1/match/{id}?matchCard=..` → `MatchDetails` (404 — projection'da yo'q); `/api/rec/v1/dream-teams/**`; `POST /api/rec/v1/card-interest/apply`; `GET /api/rec/v1/card-interest/counts?ids=` → `{ [efhubId]: { days7, days30 } }` (ROLE_ADMIN, ≤200).
- marketplace API: `POST /api/marketplace/v1/listings/ranked` body `{ ids (≤1000), minPrice, maxPrice, priceNegotiable, search, attributes, page (0..1000), size (1..100) }` → `PageResponse<ListingResponse>`; `GET /api/marketplace/v1/listings?sort=valueScore,desc`.
- Foydalanuvchi qarorlari (2026-10-02): **saralash menyusidan "Yangi/Eski e'lonlar" olib tashlanadi**, default "Qiymat bo'yicha" (`valueScore,desc`); **mehmonga tablar ko'rsatilmaydi** — u faqat Katta bozorni ko'radi.
- "Mening qiziqishlarim" va player filtri rejimida saralash menyusi ko'rsatilmaydi (tartib — shu rejimning mazmuni).
- Spec §8: rec o'chiq yoki lenta bo'sh → Katta bozor + izoh; player filtri va rec xatosi → xato holati (filtrlanmagan ro'yxat ko'rsatilmaydi); dream team saqlash xatosi → mavjud toast.
- Commit formati `feat(frontend): ...`; commit'da `Co-Authored-By` / `Claude-Session` / "Generated with Claude" yo'q.
- Deploy tartibi (runbook, B README): bu PR deploy'idan OLDIN prod'da replay, `rec-verify-projection.sh` OK va `rec-copy-dream-teams.sh` qayta ishga tushirilgan bo'lishi shart.

## Qarorlar

- **Q1.** Tab URL'da: `tab=market` = Katta bozor; `tab` yo'q = default (login qilgan → Mening qiziqishlarim, mehmon → Katta bozor). Mehmon `?tab=...` bilan kelsa ham Katta bozor.
- **Q2.** Lenta snapshot hash'i URL'da `feed=<hash>` — desktop sahifa havolalari uni olib yuradi, tab almashtirish uni o'chiradi. Hash Redis kalitida userId bilan birga — boshqa foydalanuvchiga ulashilgan havola faqat qayta hisoblashga olib keladi.
- **Q3.** Lenta bo'sh/rec xatosi bo'lsa ham tanlangan tab "Mening qiziqishlarim" bo'lib qoladi; ro'yxat Katta bozordan, ustida izoh. Mobil "yana yuklash" rejimi o'zgarsa (masalan rec yiqildi) — yuklash xato sifatida to'xtaydi, aralash ro'yxat bo'lmaydi.
- **Q4.** `/feed/details` va `/match/details` xatosi ro'yxatni to'xtatmaydi — kartalar moslik izohisiz chiqadi.
- **Q5.** Lenta rejimida kartadagi moslik yorlig'i foizsiz: `N ta o'yinchi mos` (profil 50 tagacha kriteriy — foiz ma'nosiz). Buning uchun `ListingResponse.matchKind?: 'filter' | 'feed'` (faqat frontend maydoni).
- **Q6.** Eski URL'dagi `sort=createdAt,desc|asc` noma'lum deb qaraladi → default `valueScore,desc`. `akkountlar/[slug]`, `sitemap`, `getSimilarListings` dagi aniq `createdAt,desc` — bozor tabi emas, tegilmaydi.

## Review Focus

1. **Rec ishlamay qolganda bozor** — login qilgan foydalanuvchi default tabda bo'sh/xato sahifa emas, Katta bozor + izoh ko'radi. → Task 3 `falls back to market with notice when rec fails`.
2. **Player filtri + rec xatosi** — filtrlanmagan ro'yxat emas, xato holati. → Task 3 `match mode errors instead of showing unfiltered listings`.
3. **Tartib saqlanishi** — ranked javobi va details birlashtirilganda rec tartibi buzilmaydi, details yo'q ID'lar ham qoladi. → Task 3 `keeps ranked order and attaches details by id`.
4. **Mobil yuklash rejim o'zgarishi** — 2-sahifada rec yiqilsa Katta bozor e'lonlari lenta oxiriga qo'shilmaydi. → Task 5 `rejects a next page whose mode differs`.
5. **Mehmon va `?tab=mine`** — mehmon har doim Katta bozor, tablar yo'q, `/feed` chaqirilmaydi. → Task 3 `guest never calls feed` + Task 4 `guest sees no tabs`.

---

## Fayl xaritasi

```
frontend/src/
├── app/api/rec/[...path]/route.ts                 (yangi) same-origin proxy → nginx:8080/api/rec
├── lib/marketplace-client-api.ts                  REC_API_BASE
├── lib/rec-server.ts                              (yangi) server: dream teams, listing match, interest counts
├── lib/marketplace-page-loader.ts                 (yangi) izomorf yuklovchi + transport turi
├── lib/marketplace-page-transport.ts              (yangi) brauzer transporti
├── lib/marketplace-page-server.ts                 (yangi) server transporti + FetchResult o'rami
├── lib/marketplace-sort.ts                        saralash variantlari
├── lib/marketplace-format.ts                      default sort
├── lib/marketplace-query.ts                       tab / feed URL yordamchilari
├── lib/marketplace-types.ts                       MatchDetails, matchKind
├── lib/marketplace-actions.ts                     saveDreamTeam → rec
├── lib/marketplace-server.ts                      getDreamTeams olib tashlanadi (rec-server'ga)
├── components/marketplace/marketplace-tabs.tsx    (yangi)
├── components/marketplace/marketplace-browser.tsx tablar, izoh, sort faqat market
├── components/marketplace/marketplace-toolbar.tsx bo'sh sortOptions → menyu yo'q
├── components/marketplace/marketplace-listing-feed.tsx  yuklovchi orqali keyingi sahifa
├── components/marketplace/listing-card-model.ts   lenta yorlig'i
├── components/marketplace/listing-filter-fields.tsx     default sort id
├── components/marketplace/player-filter-launcher.tsx    dream-teams, card-interest → rec
├── app/marketplace/page.tsx                       yuklovchi
├── app/marketplace/[id]/page.tsx                  moslik → rec
├── app/dream-team/page.tsx                        getDreamTeams → rec-server
└── app/admin/players/page.tsx                     talab sonlari → rec
```

---
### Task 1: rec ulanishi — proxy route, server klienti, tiplar

**Files:**
- Create: `frontend/src/app/api/rec/[...path]/route.ts`
- Create: `frontend/src/lib/rec-server.ts`
- Modify: `frontend/src/lib/marketplace-client-api.ts` (`REC_API_BASE`)
- Modify: `frontend/src/lib/marketplace-types.ts` (`MatchDetails`, `matchKind`, `FeedResponse`, `MatchIdsResponse`, `CardInterestCounts`)
- Test: `frontend/src/lib/rec-server.test.ts`

**Interfaces:**
- Produces: `REC_API_BASE = '/api/rec'`; `buildMarketplaceApiPath(path, params?, REC_API_BASE)` → `/api/rec/...`.
- Produces (`marketplace-types.ts`): `type MatchDetails = NonNullable<ListingResponse['matchDetails']>`; `ListingResponse.matchKind?: 'filter' | 'feed'`; `interface FeedResponse { empty: boolean; profileHash: string | null; ids: string[] }`; `interface MatchIdsResponse { ids: string[] }`; `type CardInterestCounts = Record<string, { days7: number; days30: number }>`.
- Produces (`rec-server.ts`, server-only): `getDreamTeams(): Promise<FetchResult<DreamTeam[]>>`; `getListingMatch(id: string, matchCards: string[] | undefined, matchStrictness: number | undefined): Promise<MatchDetails | null>`; `getCardInterestCounts(efhubIds: number[]): Promise<CardInterestCounts>`; `recFetch<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T>` (yo'l `v1/...`, xato → throw).

- [ ] **Step 1: Yiqiladigan test**

`frontend/src/lib/rec-server.test.ts`:

```ts
import { beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api');
  return { ...actual, apiFetch: mocks.apiFetch };
});

import { ApiException } from './api';
import { getCardInterestCounts, getDreamTeams, getListingMatch, recFetch } from './rec-server';

beforeEach(() => vi.resetAllMocks());

it('routes every call through the internal /rec prefix', async () => {
  mocks.apiFetch.mockResolvedValue({ ids: [] });
  await recFetch('v1/match?matchCard=1');
  expect(mocks.apiFetch).toHaveBeenCalledWith('/rec/v1/match?matchCard=1', undefined);
});

it('loads dream teams from recommendation-service', async () => {
  mocks.apiFetch.mockResolvedValue([{ id: 't' }]);
  expect(await getDreamTeams()).toEqual({ ok: true, data: [{ id: 't' }] });
  expect(mocks.apiFetch).toHaveBeenCalledWith('/rec/v1/dream-teams', undefined);
});

it('asks for one listing match with the active criteria', async () => {
  mocks.apiFetch.mockResolvedValue({ percent: 75 });
  const details = await getListingMatch('abc', ['101:p:N', '202:q:P'], 6);
  expect(details).toEqual({ percent: 75 });
  expect(mocks.apiFetch).toHaveBeenCalledWith(
    '/rec/v1/match/abc?matchCard=101%3Ap%3AN&matchCard=202%3Aq%3AP&matchStrictness=6', undefined);
});

it('skips the match call without criteria and swallows its failure', async () => {
  expect(await getListingMatch('abc', [], undefined)).toBeNull();
  expect(mocks.apiFetch).not.toHaveBeenCalled();
  mocks.apiFetch.mockRejectedValue(new ApiException(404, 'listing_not_found', 'x'));
  expect(await getListingMatch('abc', ['101:p:N'], undefined)).toBeNull();
});

it('returns interest counts and zero-safe empty map when rec is down', async () => {
  mocks.apiFetch.mockResolvedValue({ '10': { days7: 2, days30: 5 } });
  expect(await getCardInterestCounts([10, 10, 11])).toEqual({ '10': { days7: 2, days30: 5 } });
  expect(mocks.apiFetch).toHaveBeenCalledWith('/rec/v1/card-interest/counts?ids=10&ids=11', undefined);
  mocks.apiFetch.mockRejectedValue(new Error('down'));
  expect(await getCardInterestCounts([10])).toEqual({});
  expect(await getCardInterestCounts([])).toEqual({});
});
```

- [ ] **Step 2: Yiqilishini ko'ring**

Run: `cd frontend && npx vitest run src/lib/rec-server.test.ts`
Expected: FAIL — `Failed to resolve import "./rec-server"`.

- [ ] **Step 3: Tiplar va klient konstantasi**

`frontend/src/lib/marketplace-types.ts` — `ListingResponse` ichida `matchDetails?: {...} | null;` dan keyin qo'shing:

```ts
  /** Faqat frontend: moslik qayerdan — player filtri yoki shaxsiy lenta. */
  matchKind?: 'filter' | 'feed';
```

Fayl oxiriga:

```ts
export type MatchDetails = NonNullable<ListingResponse['matchDetails']>;

/** recommendation-service `/feed` javobi. `empty` → Katta bozor ko'rsatiladi. */
export interface FeedResponse {
  empty: boolean;
  profileHash: string | null;
  ids: string[];
}

export interface MatchIdsResponse {
  ids: string[];
}

export type CardInterestCounts = Record<string, { days7: number; days30: number }>;
```

`frontend/src/lib/marketplace-client-api.ts` — `const DEFAULT_BASE_PATH = '/api/marketplace';` dan keyin:

```ts
/** recommendation-service uchun same-origin proxy (`/app/api/rec/[...path]`). */
export const REC_API_BASE = '/api/rec';
```

- [ ] **Step 4: Proxy route**

`frontend/src/app/api/rec/[...path]/route.ts`:

```ts
import { type NextRequest } from 'next/server';

import { proxyInternalApiRequest } from '@/lib/internal-api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Same-origin proxy for recommendation-service. Browsers call `/api/rec/v1/...`;
 * internal nginx (`nginx:8080/api/rec/...`) strips `/rec/`, verifies the token
 * and injects X-User-* headers. Same shape as `/api/trade/[...path]/route.ts`.
 */
async function handler(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return proxyInternalApiRequest(request, context, {
    servicePrefix: 'rec',
    serviceName: 'Recommendation',
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
```

- [ ] **Step 5: rec-server**

`frontend/src/lib/rec-server.ts`:

```ts
import 'server-only';

import { apiFetch, ApiException } from './api';
import type { FetchResult } from './marketplace-server';
import type { CardInterestCounts, DreamTeam, MatchDetails } from './marketplace-types';

const REC_PREFIX = '/rec/';

type RecInit = { method?: 'GET' | 'POST'; body?: unknown };

/** recommendation-service'ga server tomondan so'rov. `path` — `v1/...`. Xato → throw. */
export function recFetch<T>(path: string, init?: RecInit): Promise<T> {
  return apiFetch<T>(`${REC_PREFIX}${path}`, init);
}

export async function getDreamTeams(): Promise<FetchResult<DreamTeam[]>> {
  const path = 'v1/dream-teams';
  try {
    return { ok: true, data: await recFetch<DreamTeam[]>(path) };
  } catch (error) {
    if (error instanceof ApiException) {
      return { ok: false, error: { path, status: error.status, code: error.code, message: error.message } };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { path, status: 0, code: 'network_error', message, networkError: true } };
  }
}

/** E'lon sahifasidagi "nega mos" izohi. Xato yoki projection'da yo'q e'lon → null (sahifa izohsiz). */
export async function getListingMatch(
  id: string,
  matchCards: string[] | undefined,
  matchStrictness: number | undefined,
): Promise<MatchDetails | null> {
  if (!matchCards?.length) return null;
  const params = new URLSearchParams();
  for (const criterion of matchCards) params.append('matchCard', criterion);
  params.set('matchStrictness', String(matchStrictness ?? 4));
  try {
    return await recFetch<MatchDetails>(`v1/match/${encodeURIComponent(id)}?${params.toString()}`);
  } catch {
    return null;
  }
}

/** Admin kartalar sahifasi: 7/30 kunlik talab. rec o'chiq bo'lsa bo'sh xarita — sahifa nol bilan ochiladi. */
export async function getCardInterestCounts(efhubIds: number[]): Promise<CardInterestCounts> {
  const ids = [...new Set(efhubIds)];
  if (ids.length === 0) return {};
  const params = new URLSearchParams();
  for (const id of ids) params.append('ids', String(id));
  try {
    return await recFetch<CardInterestCounts>(`v1/card-interest/counts?${params.toString()}`);
  } catch {
    return {};
  }
}
```

- [ ] **Step 6: Test va typecheck**

Run: `cd frontend && npx vitest run src/lib/rec-server.test.ts && npm run typecheck`
Expected: 5 passed; typecheck xatosiz.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/api/rec frontend/src/lib/rec-server.ts frontend/src/lib/rec-server.test.ts \
        frontend/src/lib/marketplace-client-api.ts frontend/src/lib/marketplace-types.ts
git commit -m "feat(frontend): recommendation-service ulanishi — proxy, server klienti, tiplar"
```

---

### Task 2: Saralash — "Yangi/Eski" yo'q, default "Qiymat bo'yicha"

**Files:**
- Modify: `frontend/src/lib/marketplace-sort.ts`
- Modify: `frontend/src/lib/marketplace-format.ts:243` (default sort)
- Modify: `frontend/src/components/marketplace/listing-filter-fields.tsx:126` (`'newest'` → `'value'`)
- Modify (testlar): `frontend/src/lib/marketplace-format.test.ts`, `frontend/src/components/marketplace/marketplace-toolbar.test.ts`, `frontend/src/components/marketplace/marketplace-result-state.test.ts` — faqat `newest`/`createdAt,desc` ga bog'liq kutishlar
- Test: `frontend/src/lib/marketplace-sort.test.ts`

**Interfaces:**
- Produces: `LISTING_SORT_OPTIONS = [{ id: 'value', label: "Qiymat bo'yicha", param: 'valueScore,desc' }, { id: 'price-asc', ... 'price,asc' }, { id: 'price-desc', ... 'price,desc' }, { id: 'popular', ... 'likeCount,desc' }]`; `DEFAULT_LISTING_SORT = 'valueScore,desc'`; `paramToSortId` noma'lum → `'value'`.
- Produces: `buildListingSearchParams` `sort` berilmasa `valueScore,desc`.

- [ ] **Step 1: Yiqiladigan test**

`frontend/src/lib/marketplace-sort.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { buildListingSearchParams } from './marketplace-format';
import { DEFAULT_LISTING_SORT, LISTING_SORT_OPTIONS, paramToSortId, sortIdToParam } from './marketplace-sort';

describe('marketplace sort', () => {
  it('has no recency ordering — newest-first is gone from the market', () => {
    expect(LISTING_SORT_OPTIONS.map((option) => option.param))
      .toEqual(['valueScore,desc', 'price,asc', 'price,desc', 'likeCount,desc']);
    expect(LISTING_SORT_OPTIONS.some((option) => option.param.startsWith('createdAt'))).toBe(false);
  });

  it('defaults to value and treats old recency links as default', () => {
    expect(DEFAULT_LISTING_SORT).toBe('valueScore,desc');
    expect(paramToSortId(undefined)).toBe('value');
    expect(paramToSortId('createdAt,desc')).toBe('value');
    expect(sortIdToParam(undefined)).toBe('valueScore,desc');
  });

  it('sends value sort to the API when none is chosen', () => {
    expect(buildListingSearchParams({}).get('sort')).toBe('valueScore,desc');
    expect(buildListingSearchParams({ sort: 'price,asc' }).get('sort')).toBe('price,asc');
  });
});
```

- [ ] **Step 2: Yiqilishini ko'ring**

Run: `cd frontend && npx vitest run src/lib/marketplace-sort.test.ts`
Expected: FAIL — `DEFAULT_LISTING_SORT` export yo'q / variantlar mos emas.

- [ ] **Step 3: marketplace-sort.ts**

Faylning boshidagi `LISTING_SORT_OPTIONS` va `paramToSortId` ni almashtiring (qolgan funksiyalar o'zgarmaydi):

```ts
/**
 * Bozor tartiblari. "Yangi/Eski e'lonlar" ataylab yo'q (2026-10-02 qaror):
 * eng so'nggi qo'yilgan e'lon tepaga chiqmasin — default qiymat bali.
 */
export const LISTING_SORT_OPTIONS = [
  { id: 'value', label: "Qiymat bo'yicha", param: 'valueScore,desc' },
  { id: 'price-asc', label: 'Arzon narx', param: 'price,asc' },
  { id: 'price-desc', label: 'Qimmat narx', param: 'price,desc' },
  { id: 'popular', label: "Ko'p yoqtirilgan", param: 'likeCount,desc' },
] as const;

export const DEFAULT_LISTING_SORT = LISTING_SORT_OPTIONS[0].param;
```

va

```ts
export function paramToSortId(param: string | undefined): ListingSortId {
  const found = LISTING_SORT_OPTIONS.find((option) => option.param === param);
  return found?.id ?? 'value';
}
```

`frontend/src/lib/marketplace-format.ts:243`:

```ts
  appendDefined(params, 'sort', input.sort ?? DEFAULT_LISTING_SORT);
```
va fayl boshiga `import { DEFAULT_LISTING_SORT } from './marketplace-sort';` (agar `marketplace-sort.ts` `marketplace-format.ts` ni import qilsa — aylanma import; tekshiring: `grep -n "marketplace-format" src/lib/marketplace-sort.ts` bo'sh bo'lishi kerak).

`frontend/src/components/marketplace/listing-filter-fields.tsx:126`: `value={draft.sort ?? 'newest'}` → `value={draft.sort ?? 'value'}`.

- [ ] **Step 4: Eski kutishlarni yangilang**

Run: `cd frontend && npx vitest run 2>&1 | grep -E 'FAIL|✗|×' | head -20`
Har yiqilgan kutish **faqat** `newest` → `value`, `createdAt,desc` (default sifatida) → `valueScore,desc` almashuvi bo'lsa yangilang; boshqa sababli yiqilsa — bu task'ning xatosi, tuzating. `marketplace-result-state.test.ts:87,99` dagi `sort=newest` — URL parametri saqlanishini tekshiradi (qiymat mazmuni muhim emas): `sort=price-asc` ga almashtiring. `marketplace-toolbar.test.ts` dagi `{ id: 'newest', label: 'Eng yangi', ... }` qo'lda yasalgan fixture — `{ id: 'value', label: "Qiymat bo'yicha", href: '/marketplace?sort=valueScore%2Cdesc' }` ga.

- [ ] **Step 5: To'liq suite va typecheck**

Run: `cd frontend && npm test && npm run typecheck`
Expected: hammasi yashil.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): bozor saralashi — eng yangi tartibi olib tashlandi, default qiymat"
```

---

### Task 3: Izomorf yuklovchi — match / mine / market rejimlari

**Files:**
- Create: `frontend/src/lib/marketplace-page-loader.ts`
- Test: `frontend/src/lib/marketplace-page-loader.test.ts`

**Interfaces:**
- Consumes: `FeedResponse`, `MatchIdsResponse`, `MatchDetails`, `ListingResponse`, `PageResponse`, `ListingBrowseParams` (Task 1, mavjud tiplar); `buildListingSearchParams` (Task 2 default bilan).
- Produces:

```ts
export type MarketplaceTab = 'mine' | 'market';
export type MarketplaceMode = 'match' | 'mine' | 'market';
export type MarketplaceNotice = 'rec_unavailable' | 'feed_empty';
export interface MarketplaceTransport {
  marketplaceGet<T>(path: string, params?: URLSearchParams): Promise<T>;
  marketplacePost<T>(path: string, body: unknown): Promise<T>;
  recGet<T>(path: string, params?: URLSearchParams): Promise<T>;
}
export interface MarketplacePageRequest { filters: ListingBrowseParams; tab: MarketplaceTab; authenticated: boolean; feedHash?: string }
export interface MarketplacePageResult { mode: MarketplaceMode; page: PageResponse<ListingResponse>; profileHash?: string; notice?: MarketplaceNotice }
export class MarketplaceLoadError extends Error { readonly mode: MarketplaceMode }
export async function loadMarketplacePage(transport: MarketplaceTransport, request: MarketplacePageRequest): Promise<MarketplacePageResult>
export const MARKETPLACE_DEFAULT_PAGE_SIZE = 12;
```
  Transport yo'llari: `marketplaceGet('v1/listings', params)`, `marketplacePost('v1/listings/ranked', body)`, `recGet('v1/feed' | 'v1/feed/details' | 'v1/match' | 'v1/match/details', params)`. Transport xatoda **throw** qiladi.

- [ ] **Step 1: Yiqiladigan testlar**

`frontend/src/lib/marketplace-page-loader.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  loadMarketplacePage,
  MarketplaceLoadError,
  type MarketplaceTransport,
} from './marketplace-page-loader';
import type { ListingResponse, MatchDetails, PageResponse } from './marketplace-types';

const listing = (id: string) => ({ id, description: id } as ListingResponse);
const page = (ids: string[], extra: Partial<PageResponse<ListingResponse>> = {}): PageResponse<ListingResponse> => ({
  content: ids.map(listing), page: 0, size: 12, totalElements: ids.length, totalPages: 1, ...extra,
});
const details = (percent: number) => ({ percent, exactCount: 1, alternateCount: 0, missingCount: 0,
  selectedCount: 1, strictness: 0, exactEfhubIds: [101], alternateEfhubIds: [], missingEfhubIds: [],
  priorityEfhubIds: [], earnedWeight: 1, possibleWeight: 1 } as MatchDetails);

function transport(overrides: Partial<{
  listings: () => unknown; ranked: (body: Record<string, unknown>) => unknown;
  feed: (params?: URLSearchParams) => unknown; feedDetails: () => unknown;
  match: (params?: URLSearchParams) => unknown; matchDetails: () => unknown;
}> = {}) {
  const calls: string[] = [];
  const t: MarketplaceTransport = {
    marketplaceGet: vi.fn(async (path, params) => {
      calls.push(`GET mp ${path}?${params?.toString() ?? ''}`);
      return (overrides.listings ?? (() => page(['m1', 'm2'])))() as never;
    }),
    marketplacePost: vi.fn(async (path, body) => {
      calls.push(`POST mp ${path}`);
      return (overrides.ranked ?? ((b: Record<string, unknown>) => page(b.ids as string[])))(
        body as Record<string, unknown>) as never;
    }),
    recGet: vi.fn(async (path, params) => {
      calls.push(`GET rec ${path}?${params?.toString() ?? ''}`);
      const map: Record<string, ((p?: URLSearchParams) => unknown) | undefined> = {
        'v1/feed': overrides.feed ?? (() => ({ empty: false, profileHash: 'h1', ids: ['a', 'b', 'c'] })),
        'v1/feed/details': overrides.feedDetails ?? (() => ({ b: details(40) })),
        'v1/match': overrides.match ?? (() => ({ ids: ['x', 'y'] })),
        'v1/match/details': overrides.matchDetails ?? (() => ({ y: details(90) })),
      };
      return map[path]!(params) as never;
    }),
  };
  return { t, calls };
}

describe('loadMarketplacePage', () => {
  it('market tab uses value-sorted browse', async () => {
    const { t, calls } = transport();
    const result = await loadMarketplacePage(t, { filters: { page: 0, size: 12 }, tab: 'market', authenticated: true });
    expect(result.mode).toBe('market');
    expect(result.page.content.map((l) => l.id)).toEqual(['m1', 'm2']);
    expect(calls[0]).toContain('GET mp v1/listings?');
    expect(calls[0]).toContain('sort=valueScore%2Cdesc');
    expect(calls).toHaveLength(1);
  });

  it('guest never calls feed even when tab says mine', async () => {
    const { t, calls } = transport();
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: false });
    expect(result.mode).toBe('market');
    expect(calls.some((c) => c.includes('v1/feed'))).toBe(false);
  });

  it('mine tab ranks the feed ids through marketplace with filters', async () => {
    const { t, calls } = transport();
    const result = await loadMarketplacePage(t, {
      filters: { page: 1, size: 2, minPrice: 1000, search: 'messi', attributes: { platform: 'pc' } },
      tab: 'mine', authenticated: true, feedHash: 'h0',
    });
    expect(result.mode).toBe('mine');
    expect(result.profileHash).toBe('h1');
    // URLSearchParams obyektlari toEqual'da doim "teng" — satr bilan solishtiramiz.
    expect(calls).toContain('GET rec v1/feed?profileHash=h0');
    expect(t.marketplacePost).toHaveBeenCalledWith('v1/listings/ranked', {
      ids: ['a', 'b', 'c'], minPrice: 1000, maxPrice: undefined, priceNegotiable: undefined,
      search: 'messi', attributes: { platform: 'pc' }, page: 1, size: 2,
    });
  });

  it('keeps ranked order and attaches details by id', async () => {
    const { t } = transport();
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: true });
    expect(result.page.content.map((l) => l.id)).toEqual(['a', 'b', 'c']);
    expect(result.page.content[1].matchDetails?.percent).toBe(40);
    expect(result.page.content[1].matchKind).toBe('feed');
    expect(result.page.content[0].matchDetails).toBeUndefined();
  });

  it('empty feed falls back to market with a notice', async () => {
    const { t } = transport({ feed: () => ({ empty: true, profileHash: null, ids: [] }) });
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: true });
    expect(result).toMatchObject({ mode: 'market', notice: 'feed_empty' });
    expect(result.page.content.map((l) => l.id)).toEqual(['m1', 'm2']);
  });

  it('falls back to market with notice when rec fails', async () => {
    const { t } = transport({ feed: () => { throw new Error('rec down'); } });
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: true });
    expect(result).toMatchObject({ mode: 'market', notice: 'rec_unavailable' });
  });

  it('details failure keeps the list without explanations', async () => {
    const { t } = transport({ feedDetails: () => { throw new Error('details down'); } });
    const result = await loadMarketplacePage(t, { filters: {}, tab: 'mine', authenticated: true });
    expect(result.mode).toBe('mine');
    expect(result.page.content.every((l) => l.matchDetails === undefined)).toBe(true);
  });

  it('player filter wins over the tab and tags filter details', async () => {
    const { t, calls } = transport();
    const result = await loadMarketplacePage(t, {
      filters: { matchCards: ['101:p:N'], matchStrictness: 6 }, tab: 'market', authenticated: true,
    });
    expect(result.mode).toBe('match');
    expect(calls).toContain('GET rec v1/match?matchCard=101%3Ap%3AN&matchStrictness=6');
    expect(calls).toContain('GET rec v1/match/details?matchCard=101%3Ap%3AN&matchStrictness=6&ids=x&ids=y');
    expect(result.page.content.map((l) => l.id)).toEqual(['x', 'y']);
    expect(result.page.content[1]).toMatchObject({ matchKind: 'filter' });
    expect(result.page.content[1].matchDetails?.percent).toBe(90);
  });

  it('match mode errors instead of showing unfiltered listings', async () => {
    const { t } = transport({ match: () => { throw new Error('rec down'); } });
    await expect(loadMarketplacePage(t, {
      filters: { matchCards: ['101:p:N'] }, tab: 'mine', authenticated: true,
    })).rejects.toBeInstanceOf(MarketplaceLoadError);
    expect(t.marketplaceGet).not.toHaveBeenCalled();
  });

  it('no matching ids returns an empty page without calling ranked', async () => {
    const { t } = transport({ match: () => ({ ids: [] }) });
    const result = await loadMarketplacePage(t, {
      filters: { matchCards: ['101:p:N'], page: 2, size: 12 }, tab: 'market', authenticated: true,
    });
    expect(result.page).toEqual({ content: [], page: 2, size: 12, totalElements: 0, totalPages: 0 });
    expect(t.marketplacePost).not.toHaveBeenCalled();
  });

  it('marketplace failure is an error, not an empty market', async () => {
    const { t } = transport({ listings: () => { throw new Error('mp down'); } });
    await expect(loadMarketplacePage(t, { filters: {}, tab: 'market', authenticated: true }))
      .rejects.toBeInstanceOf(MarketplaceLoadError);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'ring**

Run: `cd frontend && npx vitest run src/lib/marketplace-page-loader.test.ts`
Expected: FAIL — `Failed to resolve import "./marketplace-page-loader"`.

- [ ] **Step 3: Yuklovchi**

`frontend/src/lib/marketplace-page-loader.ts`:

```ts
import { buildListingSearchParams } from './marketplace-format';
import type {
  FeedResponse,
  ListingBrowseParams,
  ListingResponse,
  MatchDetails,
  MatchIdsResponse,
  PageResponse,
} from './marketplace-types';

export type MarketplaceTab = 'mine' | 'market';
export type MarketplaceMode = 'match' | 'mine' | 'market';
export type MarketplaceNotice = 'rec_unavailable' | 'feed_empty';

export const MARKETPLACE_DEFAULT_PAGE_SIZE = 12;

/** Server (apiFetch) va brauzer (same-origin proxy) uchun bir xil shartnoma. Xato → throw. */
export interface MarketplaceTransport {
  marketplaceGet<T>(path: string, params?: URLSearchParams): Promise<T>;
  marketplacePost<T>(path: string, body: unknown): Promise<T>;
  recGet<T>(path: string, params?: URLSearchParams): Promise<T>;
}

export interface MarketplacePageRequest {
  filters: ListingBrowseParams;
  tab: MarketplaceTab;
  authenticated: boolean;
  /** Oldingi javobdagi lenta snapshot hash'i — sessiya ichida tartib o'zgarmasin. */
  feedHash?: string;
}

export interface MarketplacePageResult {
  mode: MarketplaceMode;
  page: PageResponse<ListingResponse>;
  profileHash?: string;
  notice?: MarketplaceNotice;
}

export class MarketplaceLoadError extends Error {
  readonly mode: MarketplaceMode;

  constructor(mode: MarketplaceMode, cause?: unknown) {
    super(`Marketplace ${mode} page failed`, { cause });
    this.name = 'MarketplaceLoadError';
    this.mode = mode;
  }
}

/**
 * Rejim tanlovi (spec §6): player filtri bor → `match` (har ikki tabda); login qilgan va
 * "Mening qiziqishlarim" → `mine`; aks holda `market`. Lenta bo'sh yoki rec xato → `market` + izoh.
 * Player filtri xatosi esa xato — filtrlanmagan ro'yxat ko'rsatilmaydi.
 */
export async function loadMarketplacePage(
  transport: MarketplaceTransport,
  request: MarketplacePageRequest,
): Promise<MarketplacePageResult> {
  const { filters } = request;

  if (filters.matchCards?.length) {
    try {
      const params = matchParams(filters);
      const { ids } = await transport.recGet<MatchIdsResponse>('v1/match', params);
      const ranked = await rankedPage(transport, ids, filters);
      const explained = await withDetails(transport, ranked, 'v1/match/details', params, 'filter');
      return { mode: 'match', page: explained };
    } catch (error) {
      throw new MarketplaceLoadError('match', error);
    }
  }

  if (request.tab === 'mine' && request.authenticated) {
    let feed: FeedResponse;
    try {
      const params = new URLSearchParams();
      if (request.feedHash) params.set('profileHash', request.feedHash);
      feed = await transport.recGet<FeedResponse>('v1/feed', params);
    } catch {
      return { ...(await marketPage(transport, filters)), notice: 'rec_unavailable' };
    }
    if (feed.empty || feed.ids.length === 0) {
      return { ...(await marketPage(transport, filters)), notice: 'feed_empty' };
    }
    let ranked: PageResponse<ListingResponse>;
    try {
      ranked = await rankedPage(transport, feed.ids, filters);
    } catch (error) {
      throw new MarketplaceLoadError('mine', error);
    }
    const explained = await withDetails(transport, ranked, 'v1/feed/details', new URLSearchParams(), 'feed');
    return { mode: 'mine', page: explained, profileHash: feed.profileHash ?? undefined };
  }

  return marketPage(transport, filters);
}

async function marketPage(transport: MarketplaceTransport, filters: ListingBrowseParams) {
  const { matchCards: _ignored, matchStrictness: _strictness, ...rest } = filters;
  try {
    const page = await transport.marketplaceGet<PageResponse<ListingResponse>>(
      'v1/listings', buildListingSearchParams(rest));
    return { mode: 'market' as const, page };
  } catch (error) {
    throw new MarketplaceLoadError('market', error);
  }
}

function matchParams(filters: ListingBrowseParams) {
  const params = new URLSearchParams();
  for (const criterion of filters.matchCards ?? []) params.append('matchCard', criterion);
  params.set('matchStrictness', String(filters.matchStrictness ?? 4));
  return params;
}

async function rankedPage(
  transport: MarketplaceTransport,
  ids: string[],
  filters: ListingBrowseParams,
): Promise<PageResponse<ListingResponse>> {
  const page = filters.page ?? 0;
  const size = filters.size ?? MARKETPLACE_DEFAULT_PAGE_SIZE;
  if (ids.length === 0) {
    return { content: [], page, size, totalElements: 0, totalPages: 0 };
  }
  return transport.marketplacePost<PageResponse<ListingResponse>>('v1/listings/ranked', {
    ids,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    priceNegotiable: filters.priceNegotiable,
    search: filters.search,
    attributes: filters.attributes,
    page,
    size,
  });
}

/** Tafsilot ixtiyoriy: xato bo'lsa ro'yxat izohsiz qaytadi. Tartib — ranked javobidagi tartib. */
async function withDetails(
  transport: MarketplaceTransport,
  page: PageResponse<ListingResponse>,
  path: string,
  baseParams: URLSearchParams,
  kind: 'filter' | 'feed',
): Promise<PageResponse<ListingResponse>> {
  if (page.content.length === 0) return page;
  const params = new URLSearchParams(baseParams);
  for (const listing of page.content) params.append('ids', listing.id);
  let details: Record<string, MatchDetails>;
  try {
    details = await transport.recGet<Record<string, MatchDetails>>(path, params);
  } catch {
    return page;
  }
  return {
    ...page,
    content: page.content.map((listing) => {
      const match = details[listing.id];
      return match ? { ...listing, matchDetails: match, matchKind: kind } : listing;
    }),
  };
}
```

- [ ] **Step 4: Testlar o'tishini ko'ring**

Run: `cd frontend && npx vitest run src/lib/marketplace-page-loader.test.ts && npm run typecheck`
Expected: 11 passed; typecheck xatosiz.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/marketplace-page-loader.ts frontend/src/lib/marketplace-page-loader.test.ts
git commit -m "feat(frontend): bozor yuklovchisi — player filtri, Mening qiziqishlarim, Katta bozor"
```

---

### Task 4: Server sahifasi — tablar, izohlar, saralash faqat Katta bozorda

**Files:**
- Create: `frontend/src/lib/marketplace-page-server.ts`
- Create: `frontend/src/components/marketplace/marketplace-tabs.tsx`
- Modify: `frontend/src/lib/marketplace-query.ts` (tab/feed yordamchilari)
- Modify: `frontend/src/app/marketplace/page.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-browser.tsx`
- Modify: `frontend/src/components/marketplace/marketplace-toolbar.tsx` (bo'sh `sortOptions` → menyu yo'q)
- Test: `frontend/src/lib/marketplace-query.test.ts` (yangi `describe`), `frontend/src/components/marketplace/marketplace-tabs.test.ts`

**Interfaces:**
- Consumes: `loadMarketplacePage`, `MarketplaceTab`, `MarketplacePageResult`, `MarketplaceLoadError`, `MARKETPLACE_DEFAULT_PAGE_SIZE` (Task 3); `recFetch` (Task 1) — ichida `apiFetch`.
- Produces (`marketplace-query.ts`): `getMarketplaceTab(params: URLSearchParams, authenticated: boolean): MarketplaceTab`; `setMarketplaceTab(current: URLSearchParams, tab: MarketplaceTab): URLSearchParams` (`page`, `feed` o'chadi; `market` → `tab=market`, `mine` → `tab` o'chadi); `setMarketplaceFeed(current: URLSearchParams, hash: string | undefined): URLSearchParams`; `getMarketplaceFeedHash(params: URLSearchParams): string | undefined` (faqat 64 ta kichik hex).
- Produces (`marketplace-page-server.ts`, server-only): `serverMarketplaceTransport: MarketplaceTransport`; `loadMarketplacePageResult(request: MarketplacePageRequest): Promise<{ ok: true; data: MarketplacePageResult } | { ok: false; mode: MarketplaceMode }>`.
- Produces: `<MarketplaceTabs active={MarketplaceTab} rawQuery={string} />`; `MARKETPLACE_NOTICE_TEXT: Record<MarketplaceNotice, string>` (`marketplace-tabs.tsx` dan eksport).
- Produces: `MarketplaceBrowser` yangi props: `load: { ok: true; data: MarketplacePageResult } | { ok: false; mode: MarketplaceMode }`, `tab: MarketplaceTab` (eski `result` o'rniga).

- [ ] **Step 1: Yiqiladigan testlar**

`frontend/src/lib/marketplace-query.test.ts` oxiriga qo'shing (fayl boshidagi import'ga `getMarketplaceTab, setMarketplaceTab, setMarketplaceFeed, getMarketplaceFeedHash, setMarketplacePage` ni qo'shing):

```ts
describe('marketplace tabs', () => {
  const hash = 'a'.repeat(64);

  it('defaults signed-in buyers to their interests and guests to the market', () => {
    expect(getMarketplaceTab(new URLSearchParams(), true)).toBe('mine');
    expect(getMarketplaceTab(new URLSearchParams('tab=market'), true)).toBe('market');
    expect(getMarketplaceTab(new URLSearchParams('tab=mine'), false)).toBe('market');
    expect(getMarketplaceTab(new URLSearchParams(), false)).toBe('market');
  });

  it('switching tabs keeps filters but drops paging and the feed snapshot', () => {
    const current = new URLSearchParams(`minPrice=5&page=3&feed=${hash}&attr.platform=pc`);
    expect(setMarketplaceTab(current, 'market').toString()).toBe('minPrice=5&attr.platform=pc&tab=market');
    expect(setMarketplaceTab(new URLSearchParams('tab=market&page=2'), 'mine').toString()).toBe('');
  });

  it('page links keep the feed snapshot', () => {
    const withFeed = setMarketplaceFeed(new URLSearchParams('minPrice=5'), hash);
    expect(setMarketplacePage(withFeed, 2).get('feed')).toBe(hash);
    expect(setMarketplaceFeed(withFeed, undefined).has('feed')).toBe(false);
  });

  it('accepts only a well-formed feed hash', () => {
    expect(getMarketplaceFeedHash(new URLSearchParams(`feed=${hash}`))).toBe(hash);
    expect(getMarketplaceFeedHash(new URLSearchParams('feed=../x'))).toBeUndefined();
    expect(getMarketplaceFeedHash(new URLSearchParams())).toBeUndefined();
  });
});
```

`frontend/src/components/marketplace/marketplace-tabs.test.ts`:

```ts
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MARKETPLACE_NOTICE_TEXT, MarketplaceTabs } from './marketplace-tabs';

describe('MarketplaceTabs', () => {
  it('links both tabs and marks the active one', () => {
    const html = renderToStaticMarkup(createElement(MarketplaceTabs, {
      active: 'mine', rawQuery: 'minPrice=5&page=2',
    }));
    expect(html).toContain('Mening qiziqishlarim');
    expect(html).toContain('Katta bozor');
    expect(html).toContain('href="/marketplace?minPrice=5"');
    expect(html).toContain('href="/marketplace?minPrice=5&amp;tab=market"');
    expect(html).toMatch(/aria-current="page"[^>]*>[^<]*Mening qiziqishlarim/);
  });

  it('has a sentence for every notice', () => {
    expect(MARKETPLACE_NOTICE_TEXT.feed_empty).toMatch(/like/i);
    expect(MARKETPLACE_NOTICE_TEXT.rec_unavailable).toMatch(/Katta bozor/);
  });
});
```

(Mehmonga tab yo'qligi — Step 5 dagi `marketplace-browser` qoidasi bilan: `authenticated` false bo'lsa `MarketplaceTabs` render qilinmaydi. Buni `marketplace-toolbar.test.ts` uslubida manba matni bilan pinlang — Step 1 ga qo'shing:)

`frontend/src/components/marketplace/marketplace-tabs.test.ts` oxiriga:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('marketplace browser wiring', () => {
  const browser = readFileSync(resolve(process.cwd(), 'src/components/marketplace/marketplace-browser.tsx'), 'utf8');

  it('guest sees no tabs', () => {
    expect(browser).toMatch(/authenticated\s*&&\s*\(?\s*<MarketplaceTabs/);
  });

  it('sort menu exists only in the market mode', () => {
    expect(browser).toMatch(/mode === 'market'\s*\?\s*sortOptions\s*:\s*\[\]/);
  });
});
```

- [ ] **Step 2: Yiqilishini ko'ring**

Run: `cd frontend && npx vitest run src/lib/marketplace-query.test.ts src/components/marketplace/marketplace-tabs.test.ts`
Expected: FAIL — `getMarketplaceTab` export yo'q; `./marketplace-tabs` topilmadi.

- [ ] **Step 3: URL yordamchilari**

`frontend/src/lib/marketplace-query.ts` — import qo'shing: `import type { MarketplaceTab } from './marketplace-page-loader';` va fayl oxiriga:

```ts
const FEED_HASH = /^[0-9a-f]{64}$/;

/** Mehmon doim Katta bozorda; login qilgan uchun default — "Mening qiziqishlarim". */
export function getMarketplaceTab(params: URLSearchParams, authenticated: boolean): MarketplaceTab {
  if (!authenticated) return 'market';
  return params.get('tab') === 'market' ? 'market' : 'mine';
}

/** Tab almashganda filtrlar qoladi; sahifa va lenta snapshot'i yangidan boshlanadi. */
export function setMarketplaceTab(current: URLSearchParams, tab: MarketplaceTab) {
  const next = new URLSearchParams(current);
  next.delete('page');
  next.delete('feed');
  next.delete('tab');
  if (tab === 'market') next.set('tab', 'market');
  return next;
}

export function setMarketplaceFeed(current: URLSearchParams, hash: string | undefined) {
  const next = new URLSearchParams(current);
  next.delete('feed');
  if (hash && FEED_HASH.test(hash)) next.set('feed', hash);
  return next;
}

export function getMarketplaceFeedHash(params: URLSearchParams): string | undefined {
  const value = params.get('feed') ?? undefined;
  return value && FEED_HASH.test(value) ? value : undefined;
}
```

(`setMarketplacePage` ning mavjud kodi `feed` ga tegmasligini tekshiring — u faqat `page` ni o'zgartirishi kerak; testdagi "page links keep the feed snapshot" shuni pinlaydi.)

- [ ] **Step 4: Tablar komponenti va server transporti**

`frontend/src/components/marketplace/marketplace-tabs.tsx`:

```tsx
import Link from 'next/link';

import { cn } from '@/lib/utils';
import type { MarketplaceNotice, MarketplaceTab } from '@/lib/marketplace-page-loader';
import { marketplaceHref, setMarketplaceTab } from '@/lib/marketplace-query';

const TABS: { id: MarketplaceTab; label: string }[] = [
  { id: 'mine', label: 'Mening qiziqishlarim' },
  { id: 'market', label: 'Katta bozor' },
];

export const MARKETPLACE_NOTICE_TEXT: Record<MarketplaceNotice, string> = {
  feed_empty:
    "Hali siz uchun tanlov yo'q — e'lonlarga like bosing yoki Dream Team tuzing. Hozircha Katta bozor ko'rsatilmoqda.",
  rec_unavailable: "Shaxsiy tanlov hozir ishlamayapti — Katta bozor ko'rsatilmoqda.",
};

export function MarketplaceTabs({ active, rawQuery }: { active: MarketplaceTab; rawQuery: string }) {
  const params = new URLSearchParams(rawQuery);
  return (
    <nav aria-label="Bozor bo'limlari" className="flex gap-1 rounded-xl border border-border bg-card p-1">
      {TABS.map((tab) => {
        const selected = tab.id === active;
        return (
          <Link
            key={tab.id}
            href={marketplaceHref(setMarketplaceTab(params, tab.id))}
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'flex min-h-10 flex-1 items-center justify-center rounded-lg px-3 text-sm font-semibold transition-colors',
              selected ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function MarketplaceNoticeBanner({ notice }: { notice: MarketplaceNotice }) {
  return (
    <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      {MARKETPLACE_NOTICE_TEXT[notice]}
    </p>
  );
}
```

(`cn` — `src/lib/utils.ts` da; `marketplaceHref(new URLSearchParams())` `/marketplace` qaytarishini tekshiring — testdagi `href="/marketplace?minPrice=5"` kutishi mavjud xatti-harakatga tayanadi.)

`frontend/src/lib/marketplace-page-server.ts`:

```ts
import 'server-only';

import { apiFetch } from './api';
import {
  loadMarketplacePage,
  MarketplaceLoadError,
  type MarketplaceMode,
  type MarketplacePageRequest,
  type MarketplacePageResult,
  type MarketplaceTransport,
} from './marketplace-page-loader';

function withQuery(path: string, params?: URLSearchParams) {
  const query = params?.toString();
  return query ? `${path}?${query}` : path;
}

export const serverMarketplaceTransport: MarketplaceTransport = {
  marketplaceGet: (path, params) => apiFetch(withQuery(`/marketplace/${path}`, params)),
  marketplacePost: (path, body) => apiFetch(`/marketplace/${path}`, { method: 'POST', body }),
  recGet: (path, params) => apiFetch(withQuery(`/rec/${path}`, params)),
};

export type MarketplacePageLoad =
  | { ok: true; data: MarketplacePageResult }
  | { ok: false; mode: MarketplaceMode };

export async function loadMarketplacePageResult(request: MarketplacePageRequest): Promise<MarketplacePageLoad> {
  try {
    return { ok: true, data: await loadMarketplacePage(serverMarketplaceTransport, request) };
  } catch (error) {
    const mode = error instanceof MarketplaceLoadError ? error.mode : 'market';
    console.error(`[marketplace-page] ${mode} failed:`, error instanceof Error ? error.cause ?? error.message : error);
    return { ok: false, mode };
  }
}
```

- [ ] **Step 5: Sahifa, browser, toolbar**

`frontend/src/app/marketplace/page.tsx`:
- import'lar: `browseListings` o'rniga `import { loadMarketplacePageResult } from '@/lib/marketplace-page-server';`, `import { getMarketplaceFeedHash, getMarketplaceTab, getMarketplaceView } from '@/lib/marketplace-query';`, `import { MARKETPLACE_DEFAULT_PAGE_SIZE } from '@/lib/marketplace-page-loader';`.
- `const PAGE_SIZE = 12;` → olib tashlang; `if (filters.size === undefined) filters.size = MARKETPLACE_DEFAULT_PAGE_SIZE;`
- `Promise.all([resolveOptionalUser(getMe), browseListings(filters)])` o'rniga — avval foydalanuvchi (tab unga bog'liq):

```tsx
  const user = await resolveOptionalUser(getMe);
  const authenticated = user !== null;
  const tab = getMarketplaceTab(rawParams, authenticated);
  const load = await loadMarketplacePageResult({
    filters, tab, authenticated, feedHash: getMarketplaceFeedHash(rawParams),
  });
```

- `<MarketplaceBrowser ... result={result} ... authenticated={user !== null} />` → `load={load} tab={tab} authenticated={authenticated}`; `InvitationCard` sharti: `load.ok && load.data.page.content.length > 0`.

`frontend/src/components/marketplace/marketplace-browser.tsx`:
- Props: `result: FetchResult<PageResponse<ListingResponse>>` o'rniga `load: MarketplacePageLoad; tab: MarketplaceTab;` (import'lar: `MarketplacePageLoad` — `@/lib/marketplace-page-server` dan **faqat type** (`import type`), `MarketplaceTab` — `@/lib/marketplace-page-loader`; `MarketplaceTabs`, `MarketplaceNoticeBanner` — `./marketplace-tabs`; `FetchResult` import'i olib tashlanadi).
- Tanadagi `const page = result.ok ? result.data : null;` o'rniga:

```tsx
  const page = load.ok ? load.data.page : null;
  const mode = load.ok ? load.data.mode : load.mode;
  const notice = load.ok ? load.data.notice : undefined;
  const profileHash = load.ok ? load.data.profileHash : undefined;
```

- `sortOptions={sortOptions}` → `sortOptions={mode === 'market' ? sortOptions : []}`.
- `<MarketplaceResultsRegion>` ichida, `<MarketplaceToolbar` dan OLDIN:

```tsx
        {authenticated && <MarketplaceTabs active={tab} rawQuery={currentQuery} />}
        {notice && <MarketplaceNoticeBanner notice={notice} />}
```

- `{!result.ok ? (` → `{!load.ok ? (`.
- `<MarketplaceListingFeed ... />` ga yangi props (Task 5 ishlatadi): `tab={tab} authenticated={authenticated} mode={mode} profileHash={profileHash}`.

`frontend/src/components/marketplace/marketplace-toolbar.tsx:61`: `<SortMenu options={sortOptions} activeId={activeSortId} compact />` → `{sortOptions.length > 0 && <SortMenu options={sortOptions} activeId={activeSortId} compact />}`.

`MarketplaceListingFeed` props'ini shu task'da tipga qo'shing (Task 5 ishlatadi) — `marketplace-listing-feed.tsx` dagi `MarketplaceListingFeedProps` ga:

```ts
  tab: MarketplaceTab;
  authenticated: boolean;
  mode: MarketplaceMode;
  profileHash?: string;
```

- [ ] **Step 6: Testlar, typecheck, lint**

Run: `cd frontend && npm test && npm run typecheck && npm run lint`
Expected: hammasi yashil. Yiqilgan eski test `MarketplaceBrowser` ning `result` prop'iga bog'liq bo'lsa — uni `load={{ ok: true, data: { mode: 'market', page } }} tab="market"` ga moslang (mazmuni o'zgarmaydi).

- [ ] **Step 7: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): bozor tablari — Mening qiziqishlarim va Katta bozor, izohlar"
```

---

### Task 5: Mobil "yana yuklash" va sahifa havolalari — yuklovchi orqali

**Files:**
- Create: `frontend/src/lib/marketplace-page-transport.ts`
- Modify: `frontend/src/components/marketplace/marketplace-listing-feed.tsx`
- Test: `frontend/src/lib/marketplace-page-transport.test.ts`, `frontend/src/components/marketplace/marketplace-listing-feed.test.ts` (yangi holatlar)

**Interfaces:**
- Consumes: `loadMarketplacePage`, `MarketplaceTransport`, `MarketplaceMode`, `MarketplaceTab` (Task 3); `buildMarketplaceApiPath`, `REC_API_BASE` (Task 1); `setMarketplaceFeed`, `setMarketplacePage` (Task 4); Task 4 dagi feed props.
- Produces: `browserMarketplaceTransport: MarketplaceTransport`; `nextPageAccepted(expected: MarketplaceMode, actual: MarketplaceMode): boolean` (`marketplace-listing-feed.tsx` dan eksport).

- [ ] **Step 1: Yiqiladigan testlar**

`frontend/src/lib/marketplace-page-transport.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserMarketplaceTransport } from './marketplace-page-transport';

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

describe('browserMarketplaceTransport', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses the same-origin proxies', async () => {
    const fetchMock = vi.fn(async () => ok({ ids: [] }));
    vi.stubGlobal('fetch', fetchMock);
    await browserMarketplaceTransport.recGet('v1/feed', new URLSearchParams({ profileHash: 'h' }));
    await browserMarketplaceTransport.marketplaceGet('v1/listings', new URLSearchParams({ page: '1' }));
    await browserMarketplaceTransport.marketplacePost('v1/listings/ranked', { ids: ['a'] });
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      '/api/rec/v1/feed?profileHash=h',
      '/api/marketplace/v1/listings?page=1',
      '/api/marketplace/v1/listings/ranked',
    ]);
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ ids: ['a'] }) });
  });

  it('throws on a non-2xx answer', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 503 })));
    await expect(browserMarketplaceTransport.recGet('v1/feed')).rejects.toThrow('503');
  });
});
```

`frontend/src/components/marketplace/marketplace-listing-feed.test.ts` oxiriga (fayl boshidagi import'ga `nextPageAccepted` ni qo'shing; fayl `// @vitest-environment` sozlamasini o'zgartirmang):

```ts
describe('next page mode guard', () => {
  it('rejects a next page whose mode differs', () => {
    expect(nextPageAccepted('mine', 'mine')).toBe(true);
    expect(nextPageAccepted('mine', 'market')).toBe(false);
    expect(nextPageAccepted('match', 'match')).toBe(true);
  });
});

describe('feed wiring', () => {
  const feedSource = readFileSync(
    resolve(process.cwd(), 'src/components/marketplace/marketplace-listing-feed.tsx'), 'utf8');

  it('loads further pages through the shared loader, not the old browse endpoint', () => {
    expect(feedSource).toContain('loadMarketplacePage(browserMarketplaceTransport');
    expect(feedSource).not.toContain("buildMarketplaceApiPath('v1/listings'");
  });

  it('desktop page links carry the feed snapshot', () => {
    expect(feedSource).toMatch(/setMarketplaceFeed\(\s*setMarketplacePage\(/);
  });
});
```

(Agar `readFileSync`/`resolve` fayl boshida import qilinmagan bo'lsa — `import { readFileSync } from 'node:fs'; import { resolve } from 'node:path';` qo'shing.)

- [ ] **Step 2: Yiqilishini ko'ring**

Run: `cd frontend && npx vitest run src/lib/marketplace-page-transport.test.ts src/components/marketplace/marketplace-listing-feed.test.ts`
Expected: FAIL — `./marketplace-page-transport` topilmadi; `nextPageAccepted` export yo'q.

- [ ] **Step 3: Brauzer transporti**

`frontend/src/lib/marketplace-page-transport.ts`:

```ts
import { buildMarketplaceApiPath, REC_API_BASE } from './marketplace-client-api';
import type { MarketplaceTransport } from './marketplace-page-loader';

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json() as Promise<T>;
}

const common: RequestInit = { credentials: 'include', cache: 'no-store' };

/** Brauzer: same-origin `/api/marketplace` va `/api/rec` proxy'lari orqali. */
export const browserMarketplaceTransport: MarketplaceTransport = {
  marketplaceGet: async (path, params) =>
    readJson(await fetch(buildMarketplaceApiPath(path, params), common)),
  marketplacePost: async (path, body) =>
    readJson(await fetch(buildMarketplaceApiPath(path), {
      ...common,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })),
  recGet: async (path, params) =>
    readJson(await fetch(buildMarketplaceApiPath(path, params, REC_API_BASE), common)),
};
```

- [ ] **Step 4: Lenta komponenti**

`frontend/src/components/marketplace/marketplace-listing-feed.tsx`:
- import'lar: `buildMarketplaceApiPath` va `buildListingSearchParams` olib tashlanadi; qo'shiladi:

```ts
import { loadMarketplacePage, type MarketplaceMode } from '@/lib/marketplace-page-loader';
import { browserMarketplaceTransport } from '@/lib/marketplace-page-transport';
import { marketplaceHref, setMarketplaceFeed, setMarketplacePage, type MarketplaceView } from '@/lib/marketplace-query';
```

- Komponentdan tashqarida:

```ts
/** Keyingi sahifa boshqa rejimdan kelsa (masalan rec yiqildi) — aralash ro'yxat bo'lmasin. */
export function nextPageAccepted(expected: MarketplaceMode, actual: MarketplaceMode) {
  return expected === actual;
}
```

- `ListingFeed` argumentlariga `tab, authenticated, mode, profileHash` qo'shing.
- `loadNext` ichidagi `const params = buildListingSearchParams(...)` dan `const page = await response.json()...` gacha bo'lgan qismni (fetch, `response.ok` tekshiruvi, json) almashtiring:

```ts
      const nextPage = lastPage.page + 1;
      const result = await loadMarketplacePage(browserMarketplaceTransport, {
        filters: { ...filters, page: nextPage, size: initialPage.size },
        tab,
        authenticated,
        feedHash: profileHash,
      });
      if (!nextPageAccepted(mode, result.mode)) throw new Error('Marketplace mode changed');
      const page = result.page;
```
  `controller.signal.aborted` va `page.page !== nextPage` tekshiruvlari o'zgarishsiz qoladi. (`fetch` timeout'i yuklovchi ichidagi so'rovlarga ta'sir qilmaydi — `controller` faqat eskirgan javobni tashlash uchun qoladi; bu maqbul.)
- `useCallback` bog'liqliklari ro'yxatiga `tab, authenticated, mode, profileHash` qo'shing.
- Desktop pagination:

```tsx
          buildHref={page => marketplaceHref(setMarketplaceFeed(setMarketplacePage(new URLSearchParams(rawQuery), page), profileHash))} />
```

- [ ] **Step 5: Testlar, typecheck, lint**

Run: `cd frontend && npm test && npm run typecheck && npm run lint`
Expected: hammasi yashil.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): lenta keyingi sahifalari yuklovchi orqali, snapshot hash havolalarda"
```

---

### Task 6: Karta yorlig'i — lenta moslik izohi

**Files:**
- Modify: `frontend/src/components/marketplace/listing-card-model.ts`
- Test: `frontend/src/components/marketplace/listing-card-model.test.ts` (yangi yoki mavjud faylga `describe`)

**Interfaces:**
- Consumes: `ListingResponse.matchKind` (Task 1).
- Produces: `matchLabel` — `matchKind === 'feed'` → `` `${exact + alternate} ta o'yinchi mos` ``; aks holda mavjud foizli yorliq.

- [ ] **Step 1: Yiqiladigan test**

`ls frontend/src/components/marketplace/listing-card-model.test.ts` — bo'lsa oxiriga, bo'lmasa yangi fayl:

```ts
import { describe, expect, it } from 'vitest';

import { buildListingCardModel } from './listing-card-model';
import type { ListingResponse } from '@/lib/marketplace-types';

const base = {
  id: 'l', description: 'Akkount', price: 100000, priceNegotiable: false, status: 'ACTIVE',
  attributes: {}, createdAt: '2026-10-01T00:00:00Z', likeCount: 0,
} as unknown as ListingResponse;
const details = {
  percent: 7, exactCount: 2, alternateCount: 1, missingCount: 40, selectedCount: 43, strictness: 0,
  exactEfhubIds: [1, 2], alternateEfhubIds: [3], missingEfhubIds: [], priorityEfhubIds: [],
  earnedWeight: 3, possibleWeight: 44,
};

describe('match label', () => {
  it('feed matches count players instead of a meaningless percent', () => {
    const model = buildListingCardModel({ ...base, matchDetails: details, matchKind: 'feed' }, []);
    expect(model.matchLabel).toBe("3 ta o'yinchi mos");
  });

  it('player filter keeps the coverage label', () => {
    const model = buildListingCardModel({ ...base, matchDetails: details, matchKind: 'filter' }, []);
    expect(model.matchLabel).toBe('3/43 mos · 7%');
  });
});
```

- [ ] **Step 2: Yiqilishini ko'ring**

Run: `cd frontend && npx vitest run src/components/marketplace/listing-card-model.test.ts`
Expected: FAIL — `expected '3/43 mos · 7%' to be "3 ta o'yinchi mos"`.

- [ ] **Step 3: Kod**

`listing-card-model.ts` dagi `matchLabel:` ifodasini almashtiring:

```ts
    matchLabel: details
      ? listing.matchKind === 'feed'
        ? `${details.exactCount + details.alternateCount} ta o'yinchi mos`
        : `${details.exactCount + details.alternateCount}/${details.selectedCount} mos · ${details.percent}%`
      : typeof listing.matchPercent === 'number'
        ? `${listing.matchPercent}% mos`
        : null,
```

- [ ] **Step 4: Test va commit**

Run: `cd frontend && npx vitest run src/components/marketplace/listing-card-model.test.ts && npm run typecheck`
Expected: 2 passed.

```bash
git add frontend/src/components/marketplace/listing-card-model.ts frontend/src/components/marketplace/listing-card-model.test.ts
git commit -m "feat(frontend): lenta kartasida moslik — o'yinchilar soni"
```

---

### Task 7: E'lon sahifasi, dream team, card interest, admin talab — rec'ga

**Files:**
- Modify: `frontend/src/app/marketplace/[id]/page.tsx` (moslik → `getListingMatch`)
- Modify: `frontend/src/lib/marketplace-server.ts` (`getDreamTeams` va `getListing` dagi match parametrlari olib tashlanadi)
- Modify: `frontend/src/app/dream-team/page.tsx` (import → `@/lib/rec-server`)
- Modify: `frontend/src/lib/marketplace-actions.ts` (`marketplaceRequest` ga `basePath`; `saveDreamTeam` → rec)
- Modify: `frontend/src/components/marketplace/player-filter-launcher.tsx` (dream-teams, card-interest → rec)
- Modify: `frontend/src/app/admin/players/page.tsx` (talab sonlari → `getCardInterestCounts`)
- Modify (testlar): `frontend/src/lib/marketplace-actions.test.ts:64` (yo'l), `frontend/src/components/marketplace/player-filter-dialog.test.ts` (kerak bo'lsa)
- Test: `frontend/src/lib/rec-wiring.test.ts`

**Interfaces:**
- Consumes: `getDreamTeams`, `getListingMatch`, `getCardInterestCounts` (Task 1); `REC_API_BASE` (Task 1).
- Produces: `marketplaceRequest<T>(path: string[], init: RequestInit, fallbackMessage: string, basePath?: string)`.

- [ ] **Step 1: Yiqiladigan testlar**

`frontend/src/lib/marketplace-actions.test.ts:64` — kutilgan yo'lni o'zgartiring: `'/api/marketplace/v1/dream-teams/me'` → `'/api/rec/v1/dream-teams/me'`.

`frontend/src/lib/rec-wiring.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (file: string) => readFileSync(resolve(process.cwd(), 'src', file), 'utf8');

describe('recommendation wiring', () => {
  it('player filter loads dream teams and records interest through rec', () => {
    const launcher = source('components/marketplace/player-filter-launcher.tsx');
    expect(launcher).toContain("buildMarketplaceApiPath(['v1', 'dream-teams'], undefined, REC_API_BASE)");
    expect(launcher).toContain("buildMarketplaceApiPath(['v1', 'card-interest', 'apply'], undefined, REC_API_BASE)");
  });

  it('listing page asks rec for match details and marketplace only for the listing', () => {
    const page = source('app/marketplace/[id]/page.tsx');
    expect(page).toContain('getListingMatch(id, matchFilters.matchCards, matchFilters.matchStrictness)');
    expect(page).not.toMatch(/getListing\(id, matchFilters/);
  });

  it('dream team page and admin demand read from rec', () => {
    expect(source('app/dream-team/page.tsx')).toContain("from '@/lib/rec-server'");
    expect(source('app/admin/players/page.tsx')).toContain('getCardInterestCounts(');
    expect(source('lib/marketplace-server.ts')).not.toContain('dream-teams');
  });
});
```

- [ ] **Step 2: Yiqilishini ko'ring**

Run: `cd frontend && npx vitest run src/lib/rec-wiring.test.ts src/lib/marketplace-actions.test.ts`
Expected: FAIL (har ikkala faylda).

- [ ] **Step 3: Kod**

`marketplace-actions.ts`:
- `marketplaceRequest` imzosiga `basePath?: string` (4-parametr) va `fetch(buildMarketplaceApiPath(path), {` → `fetch(buildMarketplaceApiPath(path, undefined, basePath), {`.
- `saveDreamTeam` ichida `'Jamoa saqlanmadi',` → `'Jamoa saqlanmadi',\n    REC_API_BASE,`; import'ga `REC_API_BASE` (`./marketplace-client-api` dan).

`player-filter-launcher.tsx`:
- `fetch(buildMarketplaceApiPath(['v1', 'dream-teams']), {` → `fetch(buildMarketplaceApiPath(['v1', 'dream-teams'], undefined, REC_API_BASE), {`
- `void fetch(buildMarketplaceApiPath(['v1', 'card-interest', 'apply']), {` → `void fetch(buildMarketplaceApiPath(['v1', 'card-interest', 'apply'], undefined, REC_API_BASE), {`
- import: `REC_API_BASE` ni `@/lib/marketplace-client-api` dan.

`marketplace-server.ts`:
- `getDreamTeams` funksiyasini o'chiring (va keraksiz bo'lib qolgan `DreamTeam` import'ini).
- `getListing(id, matchCards?, matchStrictness?)` → `getListing(id)`: match parametrlari va ularni yig'adigan qatorlar olib tashlanadi, so'rov `${MARKETPLACE_PREFIX}/listings/${encodeURIComponent(id)}`.

`app/dream-team/page.tsx`: `import { getDreamTeams } from '@/lib/marketplace-server';` → `from '@/lib/rec-server';`.

`app/marketplace/[id]/page.tsx` (≈167-qator):

```tsx
  const [viewer, result, match] = await Promise.all([
    resolveOptionalUser(getMe),
    getListing(id),
    getListingMatch(id, matchFilters.matchCards, matchFilters.matchStrictness),
  ]);
```
va `result.ok` tekshiruvidan keyin listing ishlatiladigan joyda (komponentga uzatishdan oldin):

```tsx
  const listing = match ? { ...result.data, matchDetails: match, matchKind: 'filter' as const } : result.data;
```
— sahifaning qolgan qismida `result.data` o'rniga `listing` ishlatilsin (shu funksiya ichida `grep -n 'result.data' ` bilan barcha joylarni almashtiring). Import: `import { getListingMatch } from '@/lib/rec-server';`.

`app/admin/players/page.tsx` — `if (!result.ok) {...}` dan keyin:

```tsx
  const demand = await getCardInterestCounts(result.data.items.map((card) => card.efhubId));
  const cards = result.data.items.map((card) => {
    const counts = demand[String(card.efhubId)];
    return counts ? { ...card, interest7d: counts.days7, interest30d: counts.days30 } : card;
  });
```
va `<AdminPlayers cards={result.data.items}` → `cards={cards}`. Import: `import { getCardInterestCounts } from '@/lib/rec-server';`.

- [ ] **Step 4: To'liq tekshiruv**

Run: `cd frontend && npm test && npm run typecheck && npm run lint`
Expected: hammasi yashil. `player-filter-dialog.test.ts` dagi `"['v1', 'card-interest', 'apply']"` qidiruvi literal saqlangani uchun o'tadi; yiqilsa — faqat kutilgan satrni yangi chaqiruv shakliga moslang.

- [ ] **Step 5: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): moslik, dream team, card interest va admin talab — recommendation-service'dan"
```

---

### Task 8: nginx testi, hujjatlar, to'liq tekshiruv

**Files:**
- Modify: `frontend/src/lib/nginx-config.test.ts` (`/api/rec/` bloklari)
- Modify: `frontend/README.md` (bozor tablari, rec proxy), `backend/recommendation-service/README.md` (runbook: C oldidan), `docs/superpowers/specs/2026-09-30-recommendation-service-design.md` (holat)

- [ ] **Step 1: nginx testi**

`frontend/src/lib/nginx-config.test.ts` dagi mavjud `describe` ichiga (fayldagi `siteConfig` o'zgaruvchisi `efbazaar.conf` matni — nomini fayldan tekshiring):

```ts
  it('proxies /api/rec with optional auth and strips identity for anonymous calls', () => {
    expect(siteConfig).toContain('location /api/rec/ {');
    expect(siteConfig).toContain('location @rec_anon {');
    expect(siteConfig).toContain('location @rec_anon_internal {');
    expect(siteConfig).not.toContain('recommendation_service_unavailable');
    const anon = siteConfig.slice(siteConfig.indexOf('location @rec_anon {'));
    expect(anon.slice(0, anon.indexOf('}'))).toContain('proxy_set_header X-User-Id     ""');
  });
```

Run: `cd frontend && npx vitest run src/lib/nginx-config.test.ts`
Expected: PASS (B'da nginx allaqachon o'zgargan — bu test regressiya qo'riqchisi; avval yiqilmaydi, chunki konfiguratsiya mavjud. Yiqilishini ko'rish uchun vaqtincha `'location @rec_anon {'` ni `'location @rec_anonX {'` ga o'zgartirib ishga tushiring, keyin qaytaring.)

- [ ] **Step 2: Hujjatlar**

`frontend/README.md` — bozor bo'limiga (mavjud bo'lim nomini `grep -n '^## ' frontend/README.md` bilan toping):

```markdown
### Bozor: tablar va recommendation

- **Mening qiziqishlarim** (login qilganlarga default) — `recommendation-service` `/feed` tartibi,
  filtr va sahifalash marketplace `POST /listings/ranked` da. Snapshot hash `feed=` URL parametrida.
- **Katta bozor** (`tab=market`; mehmonga yagona ko'rinish) — `GET /listings?sort=valueScore,desc`.
  Saralash: Qiymat / Arzon / Qimmat / Ko'p yoqtirilgan ("eng yangi" yo'q).
- Player filtri har ikki tabda: rec `/match` → `ranked` → rec `/match/details`. rec xatosi → xato holati.
- Hammasi bitta `loadMarketplacePage` (`src/lib/marketplace-page-loader.ts`) orqali; server transporti
  `marketplace-page-server.ts`, brauzer transporti `marketplace-page-transport.ts`.
- Brauzer → `/api/rec/**` (Next route) → `nginx:8080/api/rec/**`.
- Dream team, card interest, admin talab sonlari va e'lon sahifasidagi moslik — `src/lib/rec-server.ts` / `REC_API_BASE`.
```

`backend/recommendation-service/README.md` — "Birinchi deploy (runbook)" ro'yxati oxiriga:

```markdown
6. **Frontend (C) deploy'idan oldin:** 3-qadam `OK`, `scripts/rec-copy-dream-teams.sh` yana bir marta
   (B→C oralig'ida marketplace'da saqlangan jamoalar), keyin frontend.
```

Spec 3-qatori: `Holat: A, B, C bajarilgan; D (marketplace tozalash) — C prod'da barqaror bo'lgach`.

- [ ] **Step 3: To'liq CI-ekvivalent tekshiruv**

Run: `cd frontend && npm run typecheck && npm run lint && npm test && npm run build`
Expected: hammasi yashil; build muvaffaqiyatli.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/nginx-config.test.ts frontend/README.md backend/recommendation-service/README.md \
        docs/superpowers/specs/2026-09-30-recommendation-service-design.md
git commit -m "docs(frontend): bozor tablari va recommendation ulanishi, C runbook"
```
