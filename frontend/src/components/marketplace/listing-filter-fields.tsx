'use client';

import * as React from 'react';
import { ChevronDown, Users } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { PLATFORM_FILTER_OPTIONS } from '@/lib/marketplace-format';
import type { MarketplaceFilterDraft, MarketplaceFilterErrors } from '@/lib/marketplace-filter-draft';

interface ListingFilterFieldsProps {
  draft: MarketplaceFilterDraft;
  errors: MarketplaceFilterErrors;
  onChange(next: MarketplaceFilterDraft): void;
  overview?: boolean;
  playerCount?: number;
  onOpenPlayers?(): void;
}

const EXCHANGE_OPTIONS = [
  { value: '', label: 'Barchasi' },
  { value: 'ACCEPTS_EXCHANGE', label: 'Obmen qabul qiladi' },
  { value: 'NONE', label: 'Obmen yo‘q' },
  { value: 'EXCHANGE_ONLY', label: 'Faqat obmen' },
  { value: 'EXCHANGE_WITH_SURCHARGE', label: 'Obmen + doplata' },
  { value: 'BOTH', label: 'Obmen yoki obmen + doplata' },
] as const;

function FilterGroup({ title, summary, overview, invalid, children }: {
  title: string; summary?: string; overview?: boolean; invalid?: boolean; children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(false);
  if (overview) return (
    <details open={expanded || invalid} onToggle={(event) => setExpanded(event.currentTarget.open)}
      className="group border-b border-border last:border-b-0">
      <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 py-4 [&::-webkit-details-marker]:hidden">
        <span><span className="block text-sm font-semibold text-foreground">{title}</span>
          <span className="mt-1 block text-xs text-muted-foreground">{summary || 'Barchasi'}</span></span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground group-open:rotate-180" aria-hidden />
      </summary>
      <div className="space-y-3 pb-5">{children}</div>
    </details>
  );
  return (
    <fieldset className="pb-5 last:pb-0">
      <legend className="mb-3 text-sm font-semibold text-foreground">{title}</legend>
      <div className="space-y-3">{children}</div>
    </fieldset>
  );
}

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} role="alert" className="mt-1 text-xs font-semibold text-destructive">{message}</p> : null;
}

function displayPrice(value: string) {
  return /^\d+$/.test(value) ? value.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : value;
}

type NumericKey = 'minPrice' | 'maxPrice' | 'teamStrengthMin' | 'teamStrengthMax'
  | 'androidCoinsMin' | 'iosCoinsMin' | 'transferLimitMin';

export function ListingFilterFields({ draft, errors, onChange, playerCount = 0, onOpenPlayers, overview = false }: ListingFilterFieldsProps) {
  const generatedId = React.useId();
  const id = (name: string) => `${generatedId}-${name}`;
  const mobile = draft.platform === 'MOBILE';
  const clean = draft.googlePlayDisconnected && draft.gameCenterDisconnected
    && /^\d+$/.test(draft.androidCoinsMin) && /^\d+$/.test(draft.iosCoinsMin);
  const update = <Key extends keyof MarketplaceFilterDraft>(key: Key, value: MarketplaceFilterDraft[Key]) => onChange({ ...draft, [key]: value });

  function numeric(key: NumericKey, label: string, placeholder = 'Kamida') {
    const price = key === 'minPrice' || key === 'maxPrice';
    const rangeError = price ? errors.price : key.startsWith('teamStrength') ? errors.teamStrength : undefined;
    const error = errors[key] ?? rangeError;
    return (
      <div>
        <Input
          id={id(key)}
          type={key === 'androidCoinsMin' || key === 'iosCoinsMin' ? 'number' : 'text'}
          inputMode="numeric"
          step={1}
          aria-label={label}
          placeholder={placeholder}
          value={price ? displayPrice(draft[key]) : draft[key]}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={error ? id(`${key}-error`) : undefined}
          onChange={(event) => update(key, price ? event.target.value.replace(/\s/g, '') : event.target.value)}
        />
        <FieldError id={id(`${key}-error`)} message={error} />
      </div>
    );
  }

  return (
    <div className={overview ? "space-y-0" : "space-y-2"}>
      <FilterGroup title="Platforma" overview={overview} summary={PLATFORM_FILTER_OPTIONS.find((option) => option.value === draft.platform)?.label} invalid={Boolean(errors.platform)}>
        <Label className="sr-only" htmlFor={id('platform')}>Platforma</Label>
        <Select id={id('platform')} value={draft.platform}
          aria-invalid={Boolean(errors.platform) || undefined}
          aria-describedby={errors.platform ? id('platform-error') : undefined}
          onChange={(event) => {
            const platform = event.target.value as MarketplaceFilterDraft['platform'];
            onChange({ ...draft, platform, ...(platform === 'MOBILE' ? {} : {
              androidCoinsMin: '', iosCoinsMin: '', transferLimitMin: '',
              googlePlayDisconnected: false, gameCenterDisconnected: false,
            }) });
          }}>
          {PLATFORM_FILTER_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        <FieldError id={id('platform-error')} message={errors.platform} />
      </FilterGroup>

      <FilterGroup title="Narx" overview={overview} summary={[draft.minPrice && `${displayPrice(draft.minPrice)} so‘m dan`, draft.maxPrice && `${displayPrice(draft.maxPrice)} so‘m gacha`, draft.priceNegotiable && 'Savdolashish mumkin'].filter(Boolean).join(' · ')} invalid={Boolean(errors.minPrice || errors.maxPrice || errors.price)}>
        <fieldset>
          <legend className="text-xs text-muted-foreground">Narx oralig‘i · so‘m</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {numeric('minPrice', 'Eng kam narx', 'Dan')}
            {numeric('maxPrice', 'Eng yuqori narx', 'Gacha')}
          </div>
        </fieldset>
        <Checkbox className="min-h-11 rounded-none border-0 bg-transparent px-0 py-2 hover:bg-transparent focus-within:ring-2 focus-within:ring-ring" id={id('negotiable')} checked={draft.priceNegotiable}
          onChange={(event) => update('priceNegotiable', event.target.checked)} label="Savdolashish mumkin" />
      </FilterGroup>

      <FilterGroup title="Obmen" overview={overview} summary={EXCHANGE_OPTIONS.find((option) => option.value === draft.exchangeMode)?.label}>
        <Label className="sr-only" htmlFor={id('exchange')}>Obmen shartlari</Label>
        <Select id={id('exchange')} value={draft.exchangeMode}
          aria-invalid={Boolean(errors.exchangeMode) || undefined}
          aria-describedby={errors.exchangeMode ? id('exchange-error') : undefined}
          onChange={(event) => update('exchangeMode', event.target.value as MarketplaceFilterDraft['exchangeMode'])}>
          {EXCHANGE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        <FieldError id={id('exchange-error')} message={errors.exchangeMode} />
      </FilterGroup>

      <FilterGroup title="O‘yinchilar" overview={overview} summary={playerCount ? `${playerCount} ta tanlangan` : 'Tanlanmagan'}>
        <Button type="button" variant="outline" className="min-h-11 w-full justify-between" onClick={onOpenPlayers} disabled={Boolean(Object.keys(errors).length)}>
          <span className="inline-flex items-center gap-2"><Users className="h-4 w-4" aria-hidden />O‘yinchilarni tanlash</span>
          {playerCount > 0 && <span className="text-xs font-bold">{playerCount} ta</span>}
        </Button>
        <p className="text-xs text-muted-foreground">{playerCount > 0 ? 'Tanlangan o‘yinchilar bo‘yicha moslik filtri faol.' : 'Kerakli kartalar yoki dream team bo‘yicha qidiring.'}</p>
      </FilterGroup>

      <FilterGroup title="Akkount" overview={overview} summary={[draft.teamStrengthMin && `TS ${draft.teamStrengthMin}+`, draft.teamStrengthMax && `TS ${draft.teamStrengthMax} gacha`, draft.division && `Division ${draft.division}`].filter(Boolean).join(' · ')} invalid={Boolean(errors.teamStrengthMin || errors.teamStrengthMax || errors.teamStrength || errors.division)}>
        <div>
          <Label htmlFor={id('teamStrengthMin')}>Team Strength (kamida)</Label>
          <div className="mt-1.5">{numeric('teamStrengthMin', 'Eng kam Team Strength')}</div>
        </div>
        <details open={Boolean(draft.teamStrengthMax || errors.teamStrengthMax || errors.teamStrength)}>
          <summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold text-muted-foreground">Team Strength yuqori chegarasi</summary>
          {numeric('teamStrengthMax', 'Eng yuqori Team Strength', 'Gacha')}
        </details>
        <div>
          <Label htmlFor={id('division')}>Erishilgan eng yuqori Division</Label>
          <Select id={id('division')} className="mt-1.5" value={draft.division}
            aria-invalid={Boolean(errors.division) || undefined}
            aria-describedby={errors.division ? id('division-error') : undefined}
            onChange={(event) => update('division', event.target.value as MarketplaceFilterDraft['division'])}>
            <option value="">Barchasi</option>
            {[1, 2, 3, 4].map((division) => <option key={division} value={division}>Division {division}{division === 4 ? '+' : ''}</option>)}
          </Select>
          <FieldError id={id('division-error')} message={errors.division} />
        </div>
      </FilterGroup>

      {mobile && <FilterGroup title="Ulanishlar va coin balansi" overview={overview} summary={clean ? 'Toza akkount' : [draft.googlePlayDisconnected && 'Google Play ulanmagan', draft.gameCenterDisconnected && 'Game Center ulanmagan', draft.androidCoinsMin && `Android ${draft.androidCoinsMin}+`, draft.iosCoinsMin && `iOS ${draft.iosCoinsMin}+`, draft.transferLimitMin && `${draft.transferLimitMin}+ almashtirish`].filter(Boolean).join(' · ')} invalid={Boolean(errors.androidCoinsMin || errors.iosCoinsMin || errors.transferLimitMin)}>
        <Checkbox className="min-h-11 rounded-none border-0 bg-transparent px-0 py-2 hover:bg-transparent focus-within:ring-2 focus-within:ring-ring" id={id('clean')} checked={clean} label="Toza akkount"
          onChange={(event) => onChange({ ...draft,
            googlePlayDisconnected: event.target.checked, gameCenterDisconnected: event.target.checked,
            androidCoinsMin: event.target.checked ? (/^\d+$/.test(draft.androidCoinsMin) ? draft.androidCoinsMin : '0') : (/^[1-9]\d*$/.test(draft.androidCoinsMin) ? draft.androidCoinsMin : ''),
            iosCoinsMin: event.target.checked ? (/^\d+$/.test(draft.iosCoinsMin) ? draft.iosCoinsMin : '0') : (/^[1-9]\d*$/.test(draft.iosCoinsMin) ? draft.iosCoinsMin : ''),
          })} />
        <p className="text-xs text-muted-foreground">Google Play va Game Center ulanmagan, ikkala coin balansi ham 0 yoki undan yuqori.</p>
        <Checkbox className="min-h-11 rounded-none border-0 bg-transparent px-0 py-2 hover:bg-transparent focus-within:ring-2 focus-within:ring-ring" id={id('google-play')} checked={draft.googlePlayDisconnected} label="Google Play ulanmagan"
          onChange={(event) => update('googlePlayDisconnected', event.target.checked)} />
        <Checkbox className="min-h-11 rounded-none border-0 bg-transparent px-0 py-2 hover:bg-transparent focus-within:ring-2 focus-within:ring-ring" id={id('game-center')} checked={draft.gameCenterDisconnected} label="Game Center ulanmagan"
          onChange={(event) => update('gameCenterDisconnected', event.target.checked)} />
        <div className="grid grid-cols-2 gap-2">
          <div><Label htmlFor={id('androidCoinsMin')}>Android coin</Label><div className="mt-1.5">{numeric('androidCoinsMin', 'Android coin (kamida)')}</div></div>
          <div><Label htmlFor={id('iosCoinsMin')}>iOS coin</Label><div className="mt-1.5">{numeric('iosCoinsMin', 'iOS coin (kamida)')}</div></div>
        </div>
        <div><Label htmlFor={id('transferLimitMin')}>Qolgan qurilma almashtirishlar (kamida)</Label><div className="mt-1.5">{numeric('transferLimitMin', 'Qolgan qurilma almashtirishlar (kamida)')}</div></div>
      </FilterGroup>}

      <details open={draft.includeSold} className="border-b border-border pb-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold">Qo‘shimcha filtrlar</summary>
        <Checkbox className="min-h-11 rounded-none border-0 bg-transparent px-0 py-2 hover:bg-transparent focus-within:ring-2 focus-within:ring-ring" id={id('include-sold')} checked={draft.includeSold} label="Sotilganlarni ham ko‘rsatish"
          onChange={(event) => update('includeSold', event.target.checked)} />
      </details>
    </div>
  );
}
