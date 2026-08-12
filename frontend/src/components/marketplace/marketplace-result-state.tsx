import { AlertTriangle, PackageSearch } from 'lucide-react';

import { MarketplacePendingLink } from '@/components/marketplace/marketplace-navigation';
import { Button } from '@/components/ui/button';
import {
  clearMarketplaceCriteria,
  marketplaceHref,
  removeMarketplaceParams,
} from '@/lib/marketplace-query';

export interface MarketplaceEmptyStateModel {
  title: string;
  body: string;
  primaryLabel: string;
  primaryHref: string;
}

const MIN_MATCH_STRICTNESS = 1;
const MAX_MATCH_STRICTNESS = 10;
const DEFAULT_MATCH_STRICTNESS = 4;

function normalizedMatchStrictness(value: string | null) {
  const parsed = Number.parseInt(value ?? '', 10);
  const strictness = Number.isFinite(parsed) ? parsed : DEFAULT_MATCH_STRICTNESS;
  return Math.max(MIN_MATCH_STRICTNESS, Math.min(MAX_MATCH_STRICTNESS, strictness));
}

function hasGeneralCriteria(params: URLSearchParams) {
  return Array.from(params.keys()).some((key) => (
    key === 'filter'
    || key === 'minPrice'
    || key === 'maxPrice'
    || key === 'priceNegotiable'
    || (key.startsWith('attr.') && key !== 'attr.platform')
  ));
}

function platformLabel(params: URLSearchParams) {
  const platform = params.get('attr.platform');
  if (platform === 'STEAM') return 'Steam';
  if (platform === 'PLAYSTATION') return 'PlayStation';
  return 'Mobile';
}

export function getMarketplaceEmptyState(
  params: URLSearchParams,
): MarketplaceEmptyStateModel {
  if (params.getAll('matchCard').length > 0) {
    const next = new URLSearchParams(params);
    const strictness = normalizedMatchStrictness(next.get('matchStrictness'));
    next.delete('page');

    if (strictness > MIN_MATCH_STRICTNESS) {
      next.set('matchStrictness', String(strictness - 1));
      return {
        title: 'Bu tarkibga mos akkount topilmadi',
        body: 'Qat’iylikni pasaytiring yoki O‘yinchilar tanlovini o‘zgartiring.',
        primaryLabel: 'Qat’iylikni pasaytirish',
        primaryHref: marketplaceHref(next),
      };
    }

    next.set('matchStrictness', String(MIN_MATCH_STRICTNESS));
    return {
      title: 'Bu tarkibga mos akkount topilmadi',
      body: 'Qat’iylikni pasaytiring yoki O‘yinchilar tanlovini o‘zgartiring.',
      primaryLabel: 'O‘yinchilarni o‘zgartirish',
      primaryHref: `${marketplaceHref(next)}#marketplace-player-filter`,
    };
  }

  const query = (params.get('q') ?? params.get('search'))?.trim();
  if (query) {
    const next = removeMarketplaceParams(params, ['q', 'search']);
    return {
      title: `“${query}” bo‘yicha natija yo‘q`,
      body: 'Boshqa nom yoki yozuvni sinab ko‘ring.',
      primaryLabel: 'Qidiruvni tahrirlash',
      primaryHref: `${marketplaceHref(next)}#marketplace-search`,
    };
  }

  if (hasGeneralCriteria(params)) {
    return {
      title: 'Bu filtrlarga mos e‘lon topilmadi',
      body: 'Bir yoki bir nechta shartni yumshatib ko‘ring.',
      primaryLabel: 'Filtrlarni yumshatish',
      primaryHref: marketplaceHref(clearMarketplaceCriteria(params)),
    };
  }

  return {
    title: `Hozircha ${platformLabel(params)} platformasida e‘lon yo‘q`,
    body: 'Birinchi bo‘lib akkountingizni joylang.',
    primaryLabel: 'Akkount joylash',
    primaryHref: '/marketplace/new',
  };
}

export function MarketplaceEmptyState({ state }: { state: MarketplaceEmptyStateModel }) {
  return (
    <ResultStateFrame
      icon={<PackageSearch className="h-10 w-10" aria-hidden="true" />}
      title={state.title}
      body={state.body}
    >
      <Button asChild className="min-h-11">
        <MarketplacePendingLink href={state.primaryHref}>
          {state.primaryLabel}
        </MarketplacePendingLink>
      </Button>
    </ResultStateFrame>
  );
}

export function MarketplaceErrorState({ retryHref }: { retryHref: string }) {
  return (
    <ResultStateFrame
      icon={<AlertTriangle className="h-10 w-10" aria-hidden="true" />}
      title="E‘lonlarni yuklay olmadik"
      body="Aloqani tekshirib, qayta urinib ko‘ring."
    >
      <Button asChild className="min-h-11">
        <MarketplacePendingLink href={retryHref}>Qayta urinish</MarketplacePendingLink>
      </Button>
    </ResultStateFrame>
  );
}

function ResultStateFrame({
  icon,
  title,
  body,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-4 py-12 text-center shadow-card sm:py-16">
      <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </div>
      <h2 className="mt-4 text-base font-black text-foreground">{title}</h2>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      <div className="mt-5">{children}</div>
    </div>
  );
}
