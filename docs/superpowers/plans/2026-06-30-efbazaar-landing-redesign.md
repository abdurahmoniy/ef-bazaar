# efBazaar Landing Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the `/` landing page into a modern glassmorphism, Soft UI, analytics-dashboard inspired efBazaar product surface while keeping existing marketplace/auth routes intact.

**Architecture:** Keep the landing page as a server-rendered Next page with local presentation helpers, because the current route is already self-contained and static. Add a small Vitest server-render regression test for the landing markup so key CTAs, product copy, and unsupported-claim exclusions stay protected. Keep shared CSS changes minimal and reusable.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, lucide-react, Vitest, react-dom/server.

---

## File Structure

- Create `frontend/src/app/page.test.tsx`: server-render tests for landing copy, CTA hrefs, and unsupported marketing claims.
- Modify `frontend/src/app/page.tsx`: redesigned landing page structure, static data arrays, and local helper components.
- Modify `frontend/src/app/globals.css`: reusable dashboard background/surface utility for the landing page.

No backend files change. Marketplace routes remain `/marketplace`, `/marketplace/[id]`, and `/marketplace/new`.

## Task 1: Add Landing Markup Regression Test

**Files:**
- Create: `frontend/src/app/page.test.tsx`
- Test command: `npm run test -- src/app/page.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/app/page.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import HomePage from './page';

function renderLanding() {
  return renderToStaticMarkup(<HomePage />);
}

describe('HomePage redesign contract', () => {
  it('renders the marketplace-first hero and primary routes', () => {
    const markup = renderLanding();

    expect(markup).toContain('eFootball akkountlari uchun premium marketplace');
    expect(markup).toContain('Marketplace command center');
    expect(markup).toContain('href="/marketplace"');
    expect(markup).toContain('href="/marketplace/new"');
  });

  it('keeps the landing page grounded in implemented trust signals', () => {
    const markup = renderLanding().toLowerCase();

    expect(markup).toContain('telegram');
    expect(markup).toContain('google');
    expect(markup).toContain('24 soat');
    expect(markup).not.toContain('escrow');
    expect(markup).not.toContain('ai pricing');
    expect(markup).not.toContain('konami');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
cd frontend
npm run test -- src/app/page.test.tsx
```

Expected: FAIL because the current page does not render `Marketplace command center` or the updated premium-marketplace hero wording.

- [ ] **Step 3: Commit the failing test**

Run:

```bash
git add frontend/src/app/page.test.tsx
git commit -m "test(frontend): cover landing redesign contract"
```

## Task 2: Redesign Landing Page

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Test: `frontend/src/app/page.test.tsx`

- [ ] **Step 1: Replace the landing content model**

In `frontend/src/app/page.tsx`, keep the existing imports from `next/link`, `lucide-react`, `Logo`, `Button`, and site config. Replace the current `HIGHLIGHTS`, `MARKET_FEATURES`, `TRUST_ITEMS`, and `STEPS` constants with these arrays:

```tsx
const MARKET_SIGNALS = [
  { value: '1-9', label: "Division filterlari", detail: 'Akkount darajasini tez saralash' },
  { value: '24 soat', label: 'Chat oynasi', detail: 'Buyer va seller suhbati tartibli' },
  { value: 'Google', label: 'Profil signali', detail: "Ulangan profil ishonchni ko'rsatadi" },
  { value: 'Telegram', label: 'Kirish va media', detail: 'Bot va Web App oqimi bilan' },
];

const FEATURE_CARDS = [
  {
    icon: SlidersHorizontal,
    title: 'Filter bilan tez saralash',
    body: "Narx, division, team strength, coinlar, playerlar va savdolashish holati bir joyda ko'rinadi.",
  },
  {
    icon: Trophy,
    title: 'Player qiymatini ko\'rish',
    body: "Messi, Neymar, Mbappe, Epic va Big Time kabi muhim playerlar listingda ajralib turadi.",
  },
  {
    icon: ShieldCheck,
    title: 'Trust signallari',
    body: "Telegram-first login, Google profil holati va seller identifikatori aniq product flowda yuradi.",
  },
  {
    icon: Heart,
    title: 'Saqlash va qiziqish',
    body: "Like va savat signallari xaridorga shortlist, sellerga esa qiziqish ko'rsatadi.",
  },
  {
    icon: MessageCircle,
    title: 'Seller bilan chat',
    body: "Xaridor listingdan egasiga chiqadi, aktiv suhbatlar spamni kamaytiradigan qoidalar bilan boshqariladi.",
  },
  {
    icon: UploadCloud,
    title: 'Akkountni joylash',
    body: "Seller listing yaratadi, account metrikalarini kiritadi va media oqimini Telegram orqali davom ettiradi.",
  },
];

const TRUST_PANELS = [
  {
    icon: Bot,
    title: 'Telegram-first kirish',
    body: "Kirish, Mini App va bot oqimi foydalanuvchini tanish muhitda boshlatadi.",
  },
  {
    icon: BadgeCheck,
    title: 'Google profil signali',
    body: "Profilga Google ulash xaridor uchun qo'shimcha ishonch signali beradi.",
  },
  {
    icon: ShieldCheck,
    title: 'Server tomonda sessiya',
    body: "Himoyalangan amallar mavjud auth flow orqali tekshiriladi, tokenlar browser JS ga ochilmaydi.",
  },
];

const FLOW_STEPS = [
  {
    number: '01',
    title: "Bozorni ko'ring",
    body: "Anonim browse ochiq: listinglar, metrikalar va player teglarini tez ko'ring.",
  },
  {
    number: '02',
    title: 'Akkountni baholang',
    body: "Division, team strength, coinlar, narx va Google signali asosida shortlist qiling.",
  },
  {
    number: '03',
    title: "Egasi bilan bog'laning",
    body: 'Login qiling, listingdan chat boshlang yoki o\'zingiz akkount joylang.',
  },
];
```

- [ ] **Step 2: Replace `HomePage` layout**

Replace the existing `HomePage` JSX with this structure:

```tsx
export default function HomePage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />
      <main className="min-h-screen overflow-hidden bg-[linear-gradient(180deg,rgba(2,6,23,0.98)_0%,rgba(15,23,42,0.96)_48%,rgba(2,6,23,1)_100%)]">
        <SiteHeader />
        <HeroSection />
        <MarketSignals />
        <FeatureSection />
        <TrustSection />
        <FlowSection />
        <FinalCta />
        <SiteFooter />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Add the redesigned landing sections**

Add local components in `frontend/src/app/page.tsx` below `HomePage`:

```tsx
function HeroSection() {
  return (
    <section className="container grid items-center gap-10 pb-14 pt-8 sm:pb-16 sm:pt-12 lg:min-h-[calc(100vh-4rem)] lg:grid-cols-[0.94fr_1.06fr] lg:gap-12 lg:pb-12">
      <div className="max-w-3xl">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.06] px-3 py-1.5 text-sm font-semibold text-cyan-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
          <Sparkles className="h-4 w-4 text-amber-300" />
          eFootball akkountlari uchun premium marketplace
        </div>
        <h1 className="text-5xl font-black leading-[0.96] text-white sm:text-6xl lg:text-7xl">
          <span className="text-gradient">efBazaar</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300 sm:text-xl">
          Division, playerlar, coinlar, narx va trust signallarini bir joyda ko'rib,
          eFootball akkount savdosini tartibli boshlang.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button asChild size="lg" className="h-12 rounded-[8px] px-6 shadow-[0_16px_45px_rgba(34,211,238,0.18)]">
            <Link href="/marketplace">
              Bozorni ko'rish
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 rounded-[8px] border-white/15 bg-white/[0.04] px-6 backdrop-blur-xl">
            <Link href="/marketplace/new">Akkount joylash</Link>
          </Button>
        </div>
        <div className="mt-8 grid max-w-2xl gap-3 sm:grid-cols-3">
          <HeroChip icon={Search} label="Anonim browse" />
          <HeroChip icon={BadgeCheck} label="Google signal" />
          <HeroChip icon={MessageCircle} label="24 soat chat" />
        </div>
      </div>

      <MarketplaceCommandCenter />
    </section>
  );
}
```

Also add `MarketSignals`, `FeatureSection`, `TrustSection`, `FlowSection`, `FinalCta`, `SectionHeader`, `HeroChip`, `MarketplaceCommandCenter`, and small metric helper components using the same data arrays. Keep cards at `rounded-[8px]`, avoid nested cards, and keep mobile grids explicit.

- [ ] **Step 4: Update header and footer**

Update `SiteHeader` so desktop nav uses `Bozor`, `Trust`, and `Flow`, the main button links to `/marketplace`, and mobile keeps only login plus marketplace. Update footer links to keep `/marketplace`, `/marketplace/new`, `/auth/login`, and Telegram.

- [ ] **Step 5: Run the landing test**

Run:

```bash
cd frontend
npm run test -- src/app/page.test.tsx
```

Expected: PASS for both `HomePage redesign contract` tests.

- [ ] **Step 6: Commit the redesigned landing page**

Run:

```bash
git add frontend/src/app/page.tsx frontend/src/app/page.test.tsx
git commit -m "feat(frontend): redesign landing page"
```

## Task 3: Add Shared Dashboard Surface Utility

**Files:**
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/src/app/page.test.tsx`

- [ ] **Step 1: Add reusable page background utility**

Add this utility to `frontend/src/app/globals.css` inside `@layer components`:

```css
.dashboard-surface {
  background:
    linear-gradient(180deg, rgba(2, 6, 23, 0.98) 0%, rgba(15, 23, 42, 0.96) 48%, rgba(2, 6, 23, 1) 100%),
    linear-gradient(90deg, rgba(255, 255, 255, 0.025) 1px, transparent 1px),
    linear-gradient(rgba(255, 255, 255, 0.025) 1px, transparent 1px);
  background-size: auto, 72px 72px, 72px 72px;
}
```

Do not add radial orb or bokeh backgrounds.

- [ ] **Step 2: Use the utility in `page.tsx`**

Update the landing `main`:

```tsx
<main className="dashboard-surface min-h-screen overflow-hidden">
```

- [ ] **Step 3: Run focused test**

Run:

```bash
cd frontend
npm run test -- src/app/page.test.tsx
```

Expected: PASS.

- [ ] **Step 4: Commit CSS utility change**

Run:

```bash
git add frontend/src/app/globals.css frontend/src/app/page.tsx
git commit -m "style(frontend): add dashboard surface utility"
```

## Task 4: Verify Build And Responsive Behavior

**Files:**
- Verify: `frontend/src/app/page.tsx`
- Verify: `frontend/src/app/page.test.tsx`
- Verify: `frontend/src/app/globals.css` if modified

- [ ] **Step 1: Run frontend tests**

Run:

```bash
cd frontend
npm run test
```

Expected: PASS for existing frontend tests plus `src/app/page.test.tsx`.

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd frontend
npm run typecheck
```

Expected: exit 0.

- [ ] **Step 3: Run production build**

Run:

```bash
cd frontend
npm run build
```

Expected: exit 0. If the build fails because of an environment-specific external service requirement, capture the exact error and verify with `npm run typecheck` plus route-level render tests.

- [ ] **Step 4: Start local dev server**

Run:

```bash
cd frontend
npm run dev
```

Expected: Next dev server starts and prints a local URL.

- [ ] **Step 5: Inspect desktop and mobile**

Open `/` at desktop width and around 390px mobile width. Verify:

- first viewport clearly shows `efBazaar`
- hero CTA links are visible and not overlapping
- command center preview is nonblank
- feature cards wrap cleanly
- no button, chip, or stat text overflows its container
- page does not read as a one-note purple/blue gradient theme

- [ ] **Step 6: Final git status**

Run:

```bash
git status --short
```

Expected: clean worktree if all planned commits were created. If local dev server is still running, stop it before finishing.
