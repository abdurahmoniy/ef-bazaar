'use client';

import * as React from 'react';

import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Search } from 'lucide-react';
import { PLATFORM_FILTER_OPTIONS } from '@/lib/marketplace-format';
import { LISTING_SORT_OPTIONS, type ListingSortId } from '@/lib/marketplace-sort';
import type {
  MarketplaceFilterDraft,
  MarketplaceFilterErrors,
} from '@/lib/marketplace-filter-draft';

interface ListingFilterFieldsProps {
  draft: MarketplaceFilterDraft;
  errors: MarketplaceFilterErrors;
  onChange(next: MarketplaceFilterDraft): void;
}

const DIVISION_OPTIONS = [
  { value: '', label: 'Barchasi' },
  { value: '1', label: 'Division 1' },
  { value: '2', label: 'Division 2' },
  { value: '3', label: 'Division 3' },
  { value: '4', label: 'Division 4+' },
] as const;

const EXCHANGE_OPTIONS = [
  { value: '', label: 'Barchasi' },
  { value: 'NONE', label: "Obmen yo‘q" },
  { value: 'EXCHANGE_ONLY', label: 'Faqat obmen' },
  { value: 'EXCHANGE_WITH_SURCHARGE', label: 'Obmen + doplata' },
  { value: 'BOTH', label: 'Obmen yoki obmen + doplata' },
] as const;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-xs font-semibold text-destructive">
      {message}
    </p>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-4 border-b border-border pb-6 last:border-b-0 last:pb-0">
      <legend className="text-sm font-black text-foreground">{title}</legend>
      <div className="space-y-4">{children}</div>
    </fieldset>
  );
}

export function ListingFilterFields({
  draft,
  errors,
  onChange,
}: ListingFilterFieldsProps) {
  const generatedId = React.useId();
  const id = (name: string) => `${generatedId}-${name}`;
  const update = <Key extends keyof MarketplaceFilterDraft>(
    key: Key,
    value: MarketplaceFilterDraft[Key],
  ) => onChange({ ...draft, [key]: value });

  const queryId = id('query');
  const sortId = id('sort');
  const platformId = id('platform');
  const platformErrorId = id('platform-error');
  const minPriceId = id('min-price');
  const minPriceErrorId = id('min-price-error');
  const maxPriceId = id('max-price');
  const maxPriceErrorId = id('max-price-error');
  const priceErrorId = id('price-error');
  const negotiableId = id('negotiable');
  const includeSoldId = id('include-sold');
  const divisionId = id('division');
  const divisionErrorId = id('division-error');
  const teamStrengthMinId = id('team-strength-min');
  const teamStrengthMinErrorId = id('team-strength-min-error');
  const teamStrengthMaxId = id('team-strength-max');
  const teamStrengthMaxErrorId = id('team-strength-max-error');
  const teamStrengthErrorId = id('team-strength-error');
  const androidCoinsId = id('android-coins');
  const androidCoinsErrorId = id('android-coins-error');
  const iosCoinsId = id('ios-coins');
  const iosCoinsErrorId = id('ios-coins-error');
  const exchangeId = id('exchange');
  const exchangeErrorId = id('exchange-error');
  const transferLimitId = id('transfer-limit');
  const transferLimitErrorId = id('transfer-limit-error');
  const googlePlayId = id('google-play');
  const gameCenterId = id('game-center');

  return (
    <div className="space-y-3">
      <FilterGroup title="Asosiy">
        <div>
          <Label htmlFor={queryId}>Qidiruv</Label>
          <div className="relative mt-1.5">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id={queryId}
              type="text"
              placeholder="Masalan: Messi, Neymar, D1..."
              value={draft.query ?? ''}
              onChange={(event) => update('query', event.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div>
          <Label htmlFor={sortId}>Saralash</Label>
          <Select
            id={sortId}
            value={draft.sort ?? 'newest'}
            onChange={(event) => update('sort', event.target.value as ListingSortId)}
            className="mt-1.5"
          >
            {LISTING_SORT_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>

        <div>
          <Label htmlFor={platformId}>Platforma</Label>
          <Select
            id={platformId}
            value={draft.platform}
            aria-invalid={Boolean(errors.platform) || undefined}
            aria-describedby={errors.platform ? platformErrorId : undefined}
            onChange={(event) => update('platform', event.target.value as MarketplaceFilterDraft['platform'])}
            className="mt-1.5"
          >
            {PLATFORM_FILTER_OPTIONS.map((option) => (
               <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <FieldError id={platformErrorId} message={errors.platform} />
        </div>

        <fieldset>
          <legend className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Narx</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Input
                id={minPriceId}
                type="text"
                inputMode="numeric"
                placeholder="Dan"
                aria-label="Eng kam narx"
                value={draft.minPrice}
                aria-invalid={Boolean(errors.minPrice || errors.price) || undefined}
                aria-describedby={errors.minPrice
                  ? minPriceErrorId
                  : errors.price ? priceErrorId : undefined}
                onChange={(event) => update('minPrice', event.target.value)}
              />
              <FieldError id={minPriceErrorId} message={errors.minPrice} />
            </div>
            <div>
              <Input
                id={maxPriceId}
                type="text"
                inputMode="numeric"
                placeholder="Gacha"
                aria-label="Eng yuqori narx"
                value={draft.maxPrice}
                aria-invalid={Boolean(errors.maxPrice || errors.price) || undefined}
                aria-describedby={errors.maxPrice
                  ? maxPriceErrorId
                  : errors.price ? priceErrorId : undefined}
                onChange={(event) => update('maxPrice', event.target.value)}
              />
              <FieldError id={maxPriceErrorId} message={errors.maxPrice} />
            </div>
          </div>
          <FieldError id={priceErrorId} message={errors.price} />
        </fieldset>

        <Checkbox
          id={negotiableId}
          checked={draft.priceNegotiable}
          onChange={(event) => update('priceNegotiable', event.target.checked)}
          label="Savdolashish mumkin"
        />

        <Checkbox
          id={includeSoldId}
          checked={draft.includeSold}
          onChange={(event) => update('includeSold', event.target.checked)}
          label="Sotilganlarni ham ko‘rsatish"
        />

        <div>
          <Label htmlFor={divisionId}>Eng yuqori Division</Label>
          <Select
            id={divisionId}
            value={draft.division}
            aria-invalid={Boolean(errors.division) || undefined}
            aria-describedby={errors.division ? divisionErrorId : undefined}
            onChange={(event) => update('division', event.target.value as MarketplaceFilterDraft['division'])}
            className="mt-1.5"
          >
            {DIVISION_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <FieldError id={divisionErrorId} message={errors.division} />
        </div>
      </FilterGroup>

      <FilterGroup title="Akkount">
        <fieldset>
          <legend className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Team Strength</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Input
                id={teamStrengthMinId}
                type="text"
                inputMode="numeric"
                placeholder="Dan"
                aria-label="Eng kam Team Strength"
                value={draft.teamStrengthMin}
                aria-invalid={Boolean(errors.teamStrengthMin || errors.teamStrength) || undefined}
                aria-describedby={errors.teamStrengthMin
                  ? teamStrengthMinErrorId
                  : errors.teamStrength ? teamStrengthErrorId : undefined}
                onChange={(event) => update('teamStrengthMin', event.target.value)}
              />
              <FieldError id={teamStrengthMinErrorId} message={errors.teamStrengthMin} />
            </div>
            <div>
              <Input
                id={teamStrengthMaxId}
                type="text"
                inputMode="numeric"
                placeholder="Gacha"
                aria-label="Eng yuqori Team Strength"
                value={draft.teamStrengthMax}
                aria-invalid={Boolean(errors.teamStrengthMax || errors.teamStrength) || undefined}
                aria-describedby={errors.teamStrengthMax
                  ? teamStrengthMaxErrorId
                  : errors.teamStrength ? teamStrengthErrorId : undefined}
                onChange={(event) => update('teamStrengthMax', event.target.value)}
              />
              <FieldError id={teamStrengthMaxErrorId} message={errors.teamStrengthMax} />
            </div>
          </div>
          <FieldError id={teamStrengthErrorId} message={errors.teamStrength} />
        </fieldset>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={androidCoinsId} className="truncate block">Android coin</Label>
            <Input
              id={androidCoinsId}
              type="number"
              step={1}
              placeholder="Kamida"
              value={draft.androidCoinsMin}
              aria-invalid={Boolean(errors.androidCoinsMin) || undefined}
              aria-describedby={errors.androidCoinsMin ? androidCoinsErrorId : undefined}
              onChange={(event) => update('androidCoinsMin', event.target.value)}
              className="mt-1.5"
            />
            <FieldError id={androidCoinsErrorId} message={errors.androidCoinsMin} />
          </div>
          <div>
            <Label htmlFor={iosCoinsId} className="truncate block">iOS coin</Label>
            <Input
              id={iosCoinsId}
              type="number"
              step={1}
              placeholder="Kamida"
              value={draft.iosCoinsMin}
              aria-invalid={Boolean(errors.iosCoinsMin) || undefined}
              aria-describedby={errors.iosCoinsMin ? iosCoinsErrorId : undefined}
              onChange={(event) => update('iosCoinsMin', event.target.value)}
              className="mt-1.5"
            />
            <FieldError id={iosCoinsErrorId} message={errors.iosCoinsMin} />
          </div>
        </div>

        <div>
          <Label htmlFor={exchangeId}>Obmen shartlari</Label>
          <Select
            id={exchangeId}
            value={draft.exchangeMode}
            aria-invalid={Boolean(errors.exchangeMode) || undefined}
            aria-describedby={errors.exchangeMode ? exchangeErrorId : undefined}
            onChange={(event) => update('exchangeMode', event.target.value as MarketplaceFilterDraft['exchangeMode'])}
            className="mt-1.5"
          >
            {EXCHANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
          <FieldError id={exchangeErrorId} message={errors.exchangeMode} />
        </div>

      </FilterGroup>

      <FilterGroup title="Xavfsizlik">
        <div>
          <Label htmlFor={transferLimitId}>Qurilma almashtirish limiti (kamida)</Label>
          <Input
            id={transferLimitId}
            type="text"
            inputMode="numeric"
            value={draft.transferLimitMin}
            aria-invalid={Boolean(errors.transferLimitMin) || undefined}
            aria-describedby={errors.transferLimitMin ? transferLimitErrorId : undefined}
            onChange={(event) => update('transferLimitMin', event.target.value)}
            className="mt-1.5"
          />
          <FieldError id={transferLimitErrorId} message={errors.transferLimitMin} />
        </div>

        <Checkbox
          id={googlePlayId}
          checked={draft.googlePlayDisconnected}
          onChange={(event) => update('googlePlayDisconnected', event.target.checked)}
          label="Google Play ulanmagan"
        />
        <Checkbox
          id={gameCenterId}
          checked={draft.gameCenterDisconnected}
          onChange={(event) => update('gameCenterDisconnected', event.target.checked)}
          label="Game Center ulanmagan"
        />
      </FilterGroup>
    </div>
  );
}
