# Pochta sloti bosimi — implementatsiya rejasi

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foydalanuvchi pochta sloti to'lib qolishidan OLDIN ogohlantirilsin va aynan qaysi qutilarni o'chirish xavfsiz ekanini — hech qaysi akkountga bog'lanmaganlarini — ko'rsin.

**Architecture:** Butunlay frontend ishi. Ikki manba allaqachon bor: trade-service `GET /api/trade/v1/mailboxes` (mening qutilarim) va `GET /api/trade/v1/mailboxes/slots` (used/limit/full), marketplace esa `getMyAccounts()` da egasiga akkount emailini qaytaradi. "Bo'sh quti" — manzili hech qaysi akkountda turmagan quti; bu solishtiruv brauzerda bajariladi, ya'ni yangi servislararo chaqiruv ham, migratsiya ham kerak emas.

**Tech Stack:** Next.js App Router, TypeScript, vitest + jsdom, `react-dom/client` bilan render testlari.

**Spec:** Shu fayl (qaror suhbatda olindi — pastdagi "Nega qayta ishlatish yo'q" bo'limiga qara).

## Global Constraints

- Matnlar o'zbekcha, mavjud komponentlar uslubida.
- Hech qanday backend, DB yoki Kafka o'zgarishi YO'Q.
- `slotWarning` hozir faqat `full` holatda matn qaytaradi — mavjud xulq saqlanadi, ustiga "to'lish arafasi" qo'shiladi.
- Cheksiz reja (`limit === null`) hech qachon ogohlantirmaydi.
- Status o'qilmasa (`null`) sahifa yiqilmaydi va ogohlantirish chiqmaydi.
- Testlar: `npx vitest run`, tur tekshiruvi: `npx tsc --noEmit`, lint: `npm run lint` — uchalasi ham toza bo'lishi shart.

## Nega qayta ishlatish yo'q (qarorning sababi — qayta ochilmasin)

Dastlab mavjud platforma pochtasini yangi savdoda qayta ishlatish o'ylangandi (resurs tejash uchun). **Voz kechildi.** Sababi: obmenda ikkala taraf ham Konami emailini bir vaqtda o'zgartiradi. Agar ikkalasiga ham tayyor quti berilsa, ikki akkount bitta pochtaga ulanib qolishi mumkin va kim birinchi ulaganini aniqlab bo'lmaydi — natijada **bitta akkount butunlay yo'qoladi**. Bu qaytarib bo'lmaydigan zarar, tejash esa arzimas. Shuning uchun har savdoda har tomonga **doim yangi quti** ochiladi (hozirgi xulq), slot bosimi esa shu rejadagi ogohlantirish bilan boshqariladi.

---

## File Structure

| Fayl | Mas'uliyati |
|---|---|
| `frontend/src/lib/mailbox-slots.ts` (modify) | Slot bosimi darajasi, ogohlantirish matni, "bo'sh quti" ajratuvchi sof funksiyalar |
| `frontend/src/lib/mailbox-slots.test.ts` (modify) | Yuqoridagilarning testlari |
| `frontend/src/components/profile/mailbox-slots-warning.tsx` (modify) | Banner: arafada ham chiqadi, ro'yxatda bo'sh qutilar birinchi va belgilangan |
| `frontend/src/components/profile/mailbox-slots-warning.test.ts` (create) | Komponent testlari |

---

### Task 1: Slot bosimi darajasi

**Files:**
- Modify: `frontend/src/lib/mailbox-slots.ts`
- Test: `frontend/src/lib/mailbox-slots.test.ts`

**Interfaces:**
- Consumes: mavjud `MailboxSlotStatus`
- Produces: `export type SlotPressure = 'none' | 'near' | 'full'`, `export function slotPressure(status: MailboxSlotStatus | null): SlotPressure`, `slotWarning` endi `near` uchun ham matn qaytaradi

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/mailbox-slots.test.ts` ichiga qo'sh:

```ts
describe('slotPressure', () => {
  it('to‘lish arafasida ogohlantiradi — to‘lgandan keyin emas', () => {
    // Slot to'lganda savdo allaqachon rad etiladi. Ogohlantirish undan
    // OLDIN kelishi kerak, aks holda u xabar emas, xulosa bo'lib qoladi.
    expect(slotPressure({ used: 2, limit: 3, full: false, plan: 'STANDARD' })).toBe('near');
    expect(slotPressure({ used: 3, limit: 3, full: true, plan: 'STANDARD' })).toBe('full');
  });

  it('kattaroq rejada arafa ham kengroq', () => {
    // 10 slotli rejada bitta bo'sh joy qolgandagina aytish kech: odam
    // bir necha savdoni parallel yuritadi. Chegara — 20%, eng kami 1.
    expect(slotPressure({ used: 7, limit: 10, full: false, plan: 'PRO' })).toBe('none');
    expect(slotPressure({ used: 8, limit: 10, full: false, plan: 'PRO' })).toBe('near');
  });

  it('joy yetarli bo‘lsa jim — banner devor qog‘ozi bo‘lib qolmasin', () => {
    expect(slotPressure({ used: 1, limit: 3, full: false, plan: 'STANDARD' })).toBe('none');
  });

  it('cheksiz rejada va status o‘qilmaganda jim', () => {
    expect(slotPressure({ used: 40, limit: null, full: false, plan: 'MAX' })).toBe('none');
    expect(slotPressure(null)).toBe('none');
  });
});

describe('slotWarning — arafa', () => {
  it('nechta joy qolganini aytadi', () => {
    const warning = slotWarning({ used: 2, limit: 3, full: false, plan: 'STANDARD' });
    expect(warning).toContain('1 ta');
    expect(warning).toContain('3');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/mailbox-slots.test.ts`
Expected: FAIL — `slotPressure is not a function`, hamda arafa matni `null` qaytadi.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/lib/mailbox-slots.ts` da `slotWarning` ni almashtir:

```ts
export type SlotPressure = 'none' | 'near' | 'full';

/**
 * Slot bosimi darajasi.
 *
 * <p>Arafa chegarasi rejaning 20% i, eng kami bitta joy: 3 slotli rejada
 * bitta joy qolganda, 10 slotlida ikkitasida ogohlantiradi. To'lgandan
 * keyin aytish kech — o'sha paytda savdo allaqachon rad etilgan bo'ladi.
 */
export function slotPressure(status: MailboxSlotStatus | null): SlotPressure {
  if (!status || status.limit === null) return 'none';
  if (status.full || status.used >= status.limit) return 'full';
  const near = Math.max(1, Math.ceil(status.limit * 0.2));
  return status.limit - status.used <= near ? 'near' : 'none';
}

/**
 * Slot holati haqidagi matn.
 *
 * <p>Raqamlar bilan: "joy qolmadi" degan gap odamga nima qilishni
 * aytmaydi, "3 tadan 3 tasi band" esa nechtasini bo'shatish kerakligini
 * darhol ko'rsatadi. Arafada esa nechta joy qolganini aytadi — odam
 * savdoni boshlashdan oldin o'zi hal qilsin.
 */
export function slotWarning(status: MailboxSlotStatus | null): string | null {
  const pressure = slotPressure(status);
  if (pressure === 'none' || !status || status.limit === null) return null;
  if (pressure === 'full') {
    return `Pochta limiti: ${status.limit} tadan ${status.used} ta joy ajratilgan. `
      + 'Sizga tegishli va savdo uchun ajratilgan qutilar limitga kiradi. Yangi savdodan oldin qutilaringizni ko‘rib chiqing.';
  }
  const left = status.limit - status.used;
  return `Pochta limiti: ${status.limit} tadan ${status.used} ta joy ajratilgan — `
    + `${left} ta qoldi. Har savdo yangi quti ochadi, shuning uchun keraksizlarini hozir bo‘shating.`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/mailbox-slots.test.ts`
Expected: PASS (eski `slotWarning` testlari ham o'zgarmay o'tadi).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/mailbox-slots.ts frontend/src/lib/mailbox-slots.test.ts
git commit -m "feat(frontend): pochta sloti to'lishidan oldin ogohlantiriladi"
```

---

### Task 2: Bo'sh qutilarni ajratish

**Files:**
- Modify: `frontend/src/lib/mailbox-slots.ts`
- Test: `frontend/src/lib/mailbox-slots.test.ts`

**Interfaces:**
- Consumes: `OwnedMailbox` (shu fayl), `UserAccountResponse` (`@/lib/accounts-types`, `email: string | null`)
- Produces: `export function isAttachedTo(mailbox: OwnedMailbox, accountEmails: ReadonlySet<string>): boolean`, `export function accountEmailSet(accounts: { email: string | null }[]): Set<string>`, `export function sortForCleanup(mailboxes: OwnedMailbox[], accountEmails: ReadonlySet<string>): OwnedMailbox[]`

- [ ] **Step 1: Write the failing test**

```ts
describe('bo‘sh qutilar', () => {
  const box = (id: string, email: string, tradeId: string | null = null): OwnedMailbox => ({
    id, email, tradeId, createdAt: '2026-09-01T00:00:00Z', handedOffAt: null,
  });

  it('akkountga bog‘langan qutini bo‘sh deb hisoblamaydi', () => {
    const emails = accountEmailSet([{ email: 'A@efbazaar.uz' }, { email: null }]);
    // Manzil registrga sezgir emas: Mailcow ham, akkount ham bir xil
    // qutini turli registrda saqlab qolishi mumkin.
    expect(isAttachedTo(box('m1', 'a@efbazaar.uz'), emails)).toBe(true);
    expect(isAttachedTo(box('m2', 'b@efbazaar.uz'), emails)).toBe(false);
  });

  it('o‘chirishga tayyorlarini tepaga chiqaradi', () => {
    // Bog'lanmagan va savdoda band bo'lmagan quti — o'chirish xavfsiz
    // bo'lgan yagona tur. Odam ro'yxatni aylanib chiqmasin.
    const emails = accountEmailSet([{ email: 'a@efbazaar.uz' }]);
    const sorted = sortForCleanup(
      [box('m1', 'a@efbazaar.uz'), box('m2', 'b@efbazaar.uz'), box('m3', 'c@efbazaar.uz', 't1')],
      emails,
    );
    expect(sorted.map((m) => m.id)).toEqual(['m2', 'm1', 'm3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/lib/mailbox-slots.test.ts`
Expected: FAIL — `accountEmailSet is not a function`.

- [ ] **Step 3: Write minimal implementation**

`frontend/src/lib/mailbox-slots.ts` oxiriga qo'sh:

```ts
/** Akkountlarga biriktirilgan manzillar — solishtiruv uchun kichik registrda. */
export function accountEmailSet(accounts: { email: string | null }[]): Set<string> {
  const out = new Set<string>();
  for (const account of accounts) {
    if (account.email) out.add(account.email.trim().toLowerCase());
  }
  return out;
}

/**
 * Quti biror akkountga biriktirilganmi.
 *
 * <p>Biriktirilgani — o'sha akkountning Konami paroli tiklanadigan
 * manzil, ya'ni uni o'chirish akkountni qaytarib bo'lmaydigan darajada
 * yo'qotishi mumkin. Biriktirilmagani esa savdodan qolgan quruq quti.
 */
export function isAttachedTo(mailbox: OwnedMailbox, accountEmails: ReadonlySet<string>): boolean {
  return accountEmails.has(mailbox.email.trim().toLowerCase());
}

/** Avval o'chirish xavfsizlari: bog'lanmagan va bo'sh, keyin bog'langan, oxirida savdodagi. */
export function sortForCleanup(
  mailboxes: OwnedMailbox[],
  accountEmails: ReadonlySet<string>,
): OwnedMailbox[] {
  const rank = (m: OwnedMailbox) => {
    if (!isDeletable(m)) return 2;
    return isAttachedTo(m, accountEmails) ? 1 : 0;
  };
  return [...mailboxes].sort((a, b) => rank(a) - rank(b));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/lib/mailbox-slots.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/mailbox-slots.ts frontend/src/lib/mailbox-slots.test.ts
git commit -m "feat(frontend): akkountga bog'lanmagan pochta qutilari ajratiladi"
```

---

### Task 3: Bannerda bo'sh qutilar ko'rinadi

**Files:**
- Modify: `frontend/src/components/profile/mailbox-slots-warning.tsx`
- Test (create): `frontend/src/components/profile/mailbox-slots-warning.test.ts`

**Interfaces:**
- Consumes: 1-va 2-vazifadagi `slotPressure`, `slotWarning`, `accountEmailSet`, `isAttachedTo`, `sortForCleanup`; `getMyAccounts()` (`@/lib/accounts-client`, `ActionResult<UserAccountResponse[]>` qaytaradi)
- Produces: o'zgarmagan `MailboxSlotsWarning` eksporti

- [ ] **Step 1: Write the failing test**

`frontend/src/components/profile/mailbox-slots-warning.test.ts` yarat:

```ts
// @vitest-environment jsdom

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/accounts-client', () => ({ getMyAccounts: vi.fn() }));
vi.mock('@/lib/mailbox-slots', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/mailbox-slots')>()),
  fetchSlotStatus: vi.fn(),
  fetchOwnedMailboxes: vi.fn(),
  deleteMailbox: vi.fn(),
}));

import { getMyAccounts } from '@/lib/accounts-client';
import { fetchOwnedMailboxes, fetchSlotStatus } from '@/lib/mailbox-slots';
import { MailboxSlotsWarning } from './mailbox-slots-warning';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  vi.mocked(fetchSlotStatus).mockResolvedValue({ used: 2, limit: 3, full: false, plan: 'STANDARD' });
  vi.mocked(fetchOwnedMailboxes).mockResolvedValue([
    { id: 'm1', email: 'bound@efbazaar.uz', tradeId: null, createdAt: '2026-09-01T00:00:00Z', handedOffAt: null },
    { id: 'm2', email: 'free@efbazaar.uz', tradeId: null, createdAt: '2026-09-02T00:00:00Z', handedOffAt: null },
  ]);
  vi.mocked(getMyAccounts).mockResolvedValue({
    ok: true,
    data: [{ email: 'bound@efbazaar.uz' } as never],
  } as never);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

const render = async () => act(async () => root.render(createElement(MailboxSlotsWarning)));

describe('MailboxSlotsWarning', () => {
  it('to‘lishidan oldin ham ko‘rinadi', async () => {
    await render();
    expect(container.textContent).toContain('1 ta qoldi');
  });

  it('bog‘lanmagan qutini belgilab, tepaga chiqaradi', async () => {
    await render();
    const openButton = Array.from(container.querySelectorAll('button'))
      .find((b) => b.textContent?.includes("ko'rish") || b.textContent?.includes('ko‘rish'))!;
    await act(async () => openButton.click());

    const rows = Array.from(container.querySelectorAll('li'));
    expect(rows[0].textContent).toContain('free@efbazaar.uz');
    expect(rows[0].textContent).toContain('Hech qaysi akkountga bog‘lanmagan');
    expect(rows[1].textContent).toContain('Akkountga bog‘langan');
  });

  it('joy yetarli bo‘lsa umuman chizilmaydi', async () => {
    vi.mocked(fetchSlotStatus).mockResolvedValue({ used: 1, limit: 3, full: false, plan: 'STANDARD' });
    await render();
    expect(container.textContent).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/components/profile/mailbox-slots-warning.test.ts`
Expected: FAIL — banner faqat `full` da chiqadi, "Hech qaysi akkountga bog'lanmagan" matni yo'q.

- [ ] **Step 3: Write minimal implementation**

`mailbox-slots-warning.tsx` da:

1. Importlarni kengaytir:

```ts
import { getMyAccounts } from '@/lib/accounts-client';
import {
  accountEmailSet,
  deleteMailbox,
  fetchOwnedMailboxes,
  fetchSlotStatus,
  isAttachedTo,
  isDeletable,
  slotPressure,
  slotWarning,
  sortForCleanup,
  type MailboxSlotStatus,
  type OwnedMailbox,
} from '@/lib/mailbox-slots';
```

2. Holat va yuklash:

```ts
  const [accountEmails, setAccountEmails] = useState<ReadonlySet<string>>(new Set());
```

`openList` ni almashtir:

```ts
  async function openList() {
    setError(null);
    try {
      const [boxes, accounts] = await Promise.all([fetchOwnedMailboxes(), getMyAccounts()]);
      // Akkountlar o'qilmasa ham ro'yxat ko'rsatiladi: u holda hamma
      // quti "bog'langan" deb qaraladi, ya'ni hech narsa xato ravishda
      // "o'chirish xavfsiz" deb belgilanmaydi.
      const emails = accounts.ok ? accountEmailSet(accounts.data) : new Set<string>(
        boxes.map((box) => box.email.trim().toLowerCase()),
      );
      setAccountEmails(emails);
      setMailboxes(sortForCleanup(boxes, emails));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yuklanmadi');
    }
  }
```

3. Sarlavha bosimga qarab:

```ts
  const pressure = slotPressure(status);
  const warning = slotWarning(status);
  if (!warning) return null;
```

va `<h2>` ni:

```tsx
          <h2 className="text-sm font-semibold">
            {pressure === 'full' ? "Pochta qutilari to'ldi" : "Pochta qutilari to'lay deb qoldi"}
          </h2>
```

4. Ro'yxat qatoridagi izoh:

```tsx
                <p className="text-xs text-muted-foreground">
                  {!isDeletable(mailbox)
                    ? 'Savdoga biriktirilgan'
                    : isAttachedTo(mailbox, accountEmails)
                      ? 'Akkountga bog‘langan — o‘chirilsa akkount tiklab bo‘lmas holga keladi'
                      : 'Hech qaysi akkountga bog‘lanmagan — o‘chirish xavfsiz'}
                </p>
```

5. O'chirish tasdig'i bog'lanmagan quti uchun qisqaroq:

```ts
  async function remove(mailbox: OwnedMailbox) {
    const attached = isAttachedTo(mailbox, accountEmails);
    const message = attached
      ? `${mailbox.email} butunlay o'chiriladi va undagi xatlar qaytarib bo'lmaydi.\n\n`
        + "Bu akkauntning Konami parolini tiklash shu manzilga keladi — "
        + "akkaunt hali sizda bo'lsa, avval Konami'da boshqa pochtaga o'tkazing.\n\nO'chirilsinmi?"
      : `${mailbox.email} butunlay o'chiriladi. Bu quti hech qaysi akkountingizga `
        + "bog'lanmagan.\n\nO'chirilsinmi?";
    if (!window.confirm(message)) return;
    setError(null);
    setBusy(mailbox.id);
    try {
      await deleteMailbox(mailbox.id);
      setMailboxes((current) => (current ?? []).filter((m) => m.id !== mailbox.id));
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "O'chirib bo'lmadi");
    } finally {
      setBusy(null);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/components/profile/mailbox-slots-warning.test.ts`
Expected: PASS

- [ ] **Step 5: To'liq tekshiruv**

Run:
```bash
cd frontend && npx tsc --noEmit && npm run lint && npx vitest run
```
Expected: tsc jim, lint `0 errors`, barcha testlar PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/profile/mailbox-slots-warning.tsx \
        frontend/src/components/profile/mailbox-slots-warning.test.ts
git commit -m "feat(frontend): bo'sh pochta qutilari ogohlantirishda birinchi turadi"
```

---

## Self-Review

**Spec coverage:**
- "to'lishi oldi ogohlantirib turishi kerak" → Task 1 (`slotPressure` → `near`).
- "bo'sh mailboxlarni, ya'ni akkountlarga bog'lanmagan mailboxlarni o'chirishi uchun warning" → Task 2 + Task 3.
- "yangi email yangi egasiga akkountga set qilingan holatda mening akkountlarim bo'limida turadi" → allaqachon bor (savdo yakunlangach `MailboxHandedOverConsumer` → `UserAccount.email`), yangi ish talab qilmaydi.
- Qayta ishlatishdan voz kechish → kod o'zgarishi yo'q, sabab hujjatlashtirildi.

**Placeholder scan:** yo'q — har qadamda haqiqiy kod bor.

**Type consistency:** `accountEmailSet` `Set<string>` qaytaradi, `isAttachedTo`/`sortForCleanup` `ReadonlySet<string>` qabul qiladi — `Set` `ReadonlySet` ga tushadi, mos. `getMyAccounts()` `ActionResult<UserAccountResponse[]>` qaytaradi, shuning uchun `accounts.ok` tekshiriladi va `accounts.data` uzatiladi.
