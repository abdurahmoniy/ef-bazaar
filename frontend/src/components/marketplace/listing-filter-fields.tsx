'use client';

import * as React from 'react';

import { CardPickerField } from '@/components/marketplace/card-picker-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PLATFORM_FILTER_OPTIONS } from '@/lib/marketplace-format';
import type {
  MarketplaceFilterDraft,
  MarketplaceFilterErrors,
} from '@/lib/marketplace-filter-draft';

interface ListingFilterFieldsProps {
  draft: MarketplaceFilterDraft;
  errors: MarketplaceFilterErrors;
  onChange(next: MarketplaceFilterDraft): void;
  collapsible: boolean;
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
  id,
  title,
  collapsible,
  children,
}: {
  id: string;
  title: string;
  collapsible: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(id === 'main');
  const fields = <div className="space-y-3 pt-3">{children}</div>;
  if (collapsible) {
    return (
      <details
        open={expanded}
        onToggle={(event) => setExpanded(event.currentTarget.open)}
        className="group rounded-xl border border-border bg-card px-3 pb-3"
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center font-bold text-foreground">
          {title}
        </summary>
        <fieldset>
          <legend className="sr-only">{title}</legend>
          {fields}
        </fieldset>
      </details>
    );
  }
  return (
    <fieldset className="space-y-3 border-b border-border pb-4 last:border-b-0 last:pb-0">
      <legend className="mb-3 text-sm font-black text-foreground">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ListingFilterFields({
  draft,
  errors,
  onChange,
  collapsible,
}: ListingFilterFieldsProps) {
  const generatedId = React.useId();
  const id = (name: string) => `${generatedId}-${name}`;
  const update = <Key extends keyof MarketplaceFilterDraft>(
    key: Key,
    value: MarketplaceFilterDraft[Key],
  ) => onChange({ ...draft, [key]: value });

  const platformId = id('platform');
  const platformErrorId = id('platform-error');
  const minPriceId = id('min-price');
  const minPriceErrorId = id('min-price-error');
  const maxPriceId = id('max-price');
  const maxPriceErrorId = id('max-price-error');
  const priceErrorId = id('price-error');
  const negotiableId = id('negotiable');
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
  const valuablePlayerId = id('valuable-player');
  const transferLimitId = id('transfer-limit');
  const transferLimitErrorId = id('transfer-limit-error');
  const googlePlayId = id('google-play');
  const gameCenterId = id('game-center');

  return (
    <div className="space-y-3">
      <FilterGroup id="main" title="Asosiy" collapsible={collapsible}>
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

        <div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={minPriceId}>Eng kam narx</Label>
              <Input
                id={minPriceId}
                type="text"
                inputMode="numeric"
                value={draft.minPrice}
                aria-invalid={Boolean(errors.minPrice || errors.price) || undefined}
                aria-describedby={errors.minPrice
                  ? minPriceErrorId
                  : errors.price ? priceErrorId : undefined}
                onChange={(event) => update('minPrice', event.target.value)}
                className="mt-1.5"
              />
              <FieldError id={minPriceErrorId} message={errors.minPrice} />
            </div>
            <div>
              <Label htmlFor={maxPriceId}>Eng yuqori narx</Label>
              <Input
                id={maxPriceId}
                type="text"
                inputMode="numeric"
                value={draft.maxPrice}
                aria-invalid={Boolean(errors.maxPrice || errors.price) || undefined}
                aria-describedby={errors.maxPrice
                  ? maxPriceErrorId
                  : errors.price ? priceErrorId : undefined}
                onChange={(event) => update('maxPrice', event.target.value)}
                className="mt-1.5"
              />
              <FieldError id={maxPriceErrorId} message={errors.maxPrice} />
            </div>
          </div>
          <FieldError id={priceErrorId} message={errors.price} />
        </div>

        <Checkbox
          id={negotiableId}
          checked={draft.priceNegotiable}
          onChange={(event) => update('priceNegotiable', event.target.checked)}
          label="Savdolashish mumkin"
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

      <FilterGroup id="account" title="Akkount" collapsible={collapsible}>
        <div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor={teamStrengthMinId}>Eng kam Team Strength</Label>
              <Input
                id={teamStrengthMinId}
                type="text"
                inputMode="numeric"
                value={draft.teamStrengthMin}
                aria-invalid={Boolean(errors.teamStrengthMin || errors.teamStrength) || undefined}
                aria-describedby={errors.teamStrengthMin
                  ? teamStrengthMinErrorId
                  : errors.teamStrength ? teamStrengthErrorId : undefined}
                onChange={(event) => update('teamStrengthMin', event.target.value)}
                className="mt-1.5"
              />
              <FieldError id={teamStrengthMinErrorId} message={errors.teamStrengthMin} />
            </div>
            <div>
              <Label htmlFor={teamStrengthMaxId}>Eng yuqori Team Strength</Label>
              <Input
                id={teamStrengthMaxId}
                type="text"
                inputMode="numeric"
                value={draft.teamStrengthMax}
                aria-invalid={Boolean(errors.teamStrengthMax || errors.teamStrength) || undefined}
                aria-describedby={errors.teamStrengthMax
                  ? teamStrengthMaxErrorId
                  : errors.teamStrength ? teamStrengthErrorId : undefined}
                onChange={(event) => update('teamStrengthMax', event.target.value)}
                className="mt-1.5"
              />
              <FieldError id={teamStrengthMaxErrorId} message={errors.teamStrengthMax} />
            </div>
          </div>
          <FieldError id={teamStrengthErrorId} message={errors.teamStrength} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={androidCoinsId}>Android coin (kamida)</Label>
            <Input
              id={androidCoinsId}
              type="number"
              step={1}
              value={draft.androidCoinsMin}
              aria-invalid={Boolean(errors.androidCoinsMin) || undefined}
              aria-describedby={errors.androidCoinsMin ? androidCoinsErrorId : undefined}
              onChange={(event) => update('androidCoinsMin', event.target.value)}
              className="mt-1.5"
            />
            <FieldError id={androidCoinsErrorId} message={errors.androidCoinsMin} />
          </div>
          <div>
            <Label htmlFor={iosCoinsId}>iOS coin (kamida)</Label>
            <Input
              id={iosCoinsId}
              type="number"
              step={1}
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

        <div>
          <Label htmlFor={valuablePlayerId}>Yulduz o‘yinchi</Label>
          <div className="mt-1.5">
            <CardPickerField
              id={valuablePlayerId}
              value={draft.valuablePlayer}
              onChange={(value) => update('valuablePlayer', value)}
            />
          </div>
        </div>
      </FilterGroup>

      <FilterGroup id="safety" title="Xavfsizlik" collapsible={collapsible}>
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
