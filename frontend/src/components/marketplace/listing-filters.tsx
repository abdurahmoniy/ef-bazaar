import { SlidersHorizontal, TrendingUp } from 'lucide-react'
import Link from 'next/link'

import { CardPickerField } from '@/components/marketplace/card-picker-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
	DEFAULT_PLATFORM,
	MARKETPLACE_FILTERS,
	PLATFORM_FILTER_OPTIONS,
	type MarketplaceFilterId,
} from '@/lib/marketplace-format'
import { LISTING_SORT_OPTIONS, paramToSortId } from '@/lib/marketplace-sort'
import { cn } from '@/lib/utils'

interface ListingFiltersProps {
	activeFilter: MarketplaceFilterId
	query?: string
	minPrice?: number
	maxPrice?: number
	priceNegotiable?: boolean
	division?: number
	valuablePlayerId?: number
	valuablePlayerName?: string
	sortParam?: string
	/** Raw attr.* filters from the URL — source of defaultValues for attribute fields. */
	attributes?: Record<string, string>
}

const DIVISION_CHOICES = [1, 2, 3, 4] as const
const DIVISION_LABELS: Record<number, string> = {
	1: 'Division 1',
	2: 'Division 2',
	3: 'Division 3',
	4: 'Division 4+',
}

// Values + labels mirror the exchange_mode attribute definition (V17 migration).
const EXCHANGE_MODE_OPTIONS = [
	{ value: 'NONE', label: "Obmen yo'q" },
	{ value: 'EXCHANGE_ONLY', label: 'Faqat obmen' },
	{ value: 'EXCHANGE_WITH_SURCHARGE', label: 'Obmen + doplata' },
	{ value: 'BOTH', label: 'Obmen yoki obmen + doplata' },
] as const

export function ListingFilters(props: ListingFiltersProps) {
	return (
		<aside className='hidden space-y-3 lg:sticky lg:top-32 lg:block'>
			<ListingFiltersForm
				{...props}
				className='rounded-xl border border-border bg-card p-4 shadow-card'
				showHeading
			/>
		</aside>
	)
}

export function ListingFiltersForm({
	query,
	minPrice,
	maxPrice,
	priceNegotiable,
	division,
	valuablePlayerId,
	valuablePlayerName,
	sortParam,
	attributes,
	className,
	showHeading = false,
}: ListingFiltersProps & { className?: string; showHeading?: boolean }) {
	const currentSortId = paramToSortId(sortParam)
	const attr = (key: string) => attributes?.[key] ?? ''

	return (
		<form action='/marketplace' method='get' className={className}>
			{query && <input type='hidden' name='q' value={query} />}

			{showHeading && (
				<div className='flex items-center gap-2 pb-3 text-sm font-bold text-foreground'>
					<SlidersHorizontal className='h-4 w-4 text-primary' />
					Filtrlar
				</div>
			)}

			<div className='space-y-3'>
					<div>
						<div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
							Platforma
						</div>
						{/* Required — no "Barchasi" option; an unset URL means the default. */}
						<Select
							name='attr.platform'
							required
							defaultValue={attr('platform') || DEFAULT_PLATFORM}
							className='h-10'
						>
							{PLATFORM_FILTER_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</Select>
					</div>

					<div>
						<div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
							Narx, so'm
						</div>
						<div className='grid grid-cols-2 gap-2'>
							<Input
								name='minPrice'
								type='number'
								inputMode='numeric'
								min={0}
								step={10000}
								placeholder='dan'
								defaultValue={minPrice ?? ''}
								className='h-10 rounded-lg'
							/>
							<Input
								name='maxPrice'
								type='number'
								inputMode='numeric'
								min={0}
								step={10000}
								placeholder='gacha'
								defaultValue={maxPrice ?? ''}
								className='h-10 rounded-lg'
							/>
						</div>
					</div>

					<div>
						<div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
							Eng yuqori Division
						</div>
						<Select
							name='attr.highest_division_level'
							defaultValue={division === undefined ? '' : String(division)}
							className='h-10'
						>
							<option value=''>Barchasi</option>
							{DIVISION_CHOICES.map((div) => (
								<option key={div} value={div}>
									{DIVISION_LABELS[div]}
								</option>
							))}
						</Select>
					</div>

					<div>
						<div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
							Team Strength
						</div>
						<div className='grid grid-cols-2 gap-2'>
							<Input
								name='attr.team_strength.min'
								type='number'
								inputMode='numeric'
								min={0}
								step={100}
								placeholder='dan'
								defaultValue={attr('team_strength.min')}
								className='h-10 rounded-lg'
							/>
							<Input
								name='attr.team_strength.max'
								type='number'
								inputMode='numeric'
								min={0}
								step={100}
								placeholder='gacha'
								defaultValue={attr('team_strength.max')}
								className='h-10 rounded-lg'
							/>
						</div>
					</div>

					<div>
						<div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
							Coin (kamida)
						</div>
						{/* No min / inputMode: balances can be negative, and the
						    digit-only mobile keypad has no minus key. */}
						<div className='grid grid-cols-2 gap-2'>
							<Input
								name='attr.android_coins.min'
								type='number'
								step={1000}
								placeholder='Android'
								aria-label='Android coin (kamida)'
								defaultValue={attr('android_coins.min')}
								className='h-10 rounded-lg'
							/>
							<Input
								name='attr.ios_coins.min'
								type='number'
								step={1000}
								placeholder='iOS'
								aria-label='iOS coin (kamida)'
								defaultValue={attr('ios_coins.min')}
								className='h-10 rounded-lg'
							/>
						</div>
					</div>

					<div>
						<div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
							Qurilma almashtirish limiti (kamida)
						</div>
						{/* Handover burns two sign-ins; buyers who want headroom
						    filter for accounts with more left this month. */}
						<Input
							name='attr.device_transfer_limit.min'
							type='number'
							inputMode='numeric'
							min={2}
							max={10}
							step={1}
							placeholder='masalan 4'
							aria-label='Qurilma almashtirish limiti (kamida)'
							defaultValue={attr('device_transfer_limit.min')}
							className='h-10 rounded-lg'
						/>
					</div>

					<div>
						<div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
							Obmen shartlari
						</div>
						<Select
							name='attr.exchange_mode'
							defaultValue={attr('exchange_mode')}
							className='h-10'
						>
							<option value=''>Barchasi</option>
							{EXCHANGE_MODE_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{option.label}
								</option>
							))}
						</Select>
					</div>

					<div className='space-y-2'>
						<Checkbox
							name='priceNegotiable'
							value='true'
							defaultChecked={priceNegotiable === true}
							label='Savdolashish mumkin'
							className='p-2'
						/>
						{/* Store links block a clean transfer (only Konami ID moves), so
						    buyers filter for accounts WITHOUT them. */}
						<Checkbox
							name='attr.has_google_play_link'
							value='false'
							defaultChecked={attr('has_google_play_link') === 'false'}
							label='Google Play ulanmagan'
							className='p-2'
						/>
						<Checkbox
							name='attr.has_game_center_link'
							value='false'
							defaultChecked={attr('has_game_center_link') === 'false'}
							label='Game Center ulanmagan'
							className='p-2'
						/>
					</div>

					<div>
						<div className='mb-1.5 text-xs font-semibold text-muted-foreground'>
							Yulduz o'yinchi
						</div>
						<CardPickerField
							defaultEfhubId={valuablePlayerId}
							defaultName={valuablePlayerName}
						/>
					</div>

					<div>
						<div className='mb-1.5 flex items-center gap-1 text-xs font-semibold text-muted-foreground'>
							<TrendingUp className='h-3.5 w-3.5' /> Saralash
						</div>
						<Select
							name='sort'
							defaultValue={
								LISTING_SORT_OPTIONS.find((o) => o.id === currentSortId)?.param
							}
							className='h-10'
						>
							{LISTING_SORT_OPTIONS.map((option) => (
								<option key={option.id} value={option.param}>
									{option.label}
								</option>
							))}
						</Select>
					</div>

					{/* Sticks to the bottom of the mobile filter sheet's scroll area so
					    "Qo'llash" stays reachable without scrolling the whole form.
					    In the desktop sidebar the container doesn't scroll, so this is inert. */}
					<div className='sticky bottom-0 -mx-4 grid grid-cols-2 gap-2 border-t border-border bg-card/95 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-1 lg:backdrop-blur-none'>
						<Button type='submit' className='h-11 rounded-lg'>
							Qo'llash
						</Button>
						<Button asChild variant='outline' className='h-11 rounded-lg'>
							<Link href='/marketplace'>Tozalash</Link>
						</Button>
					</div>
				</div>
		</form>
	)
}

export function QuickChips({
	activeFilter,
	query,
	view,
}: {
	activeFilter: MarketplaceFilterId
	query?: string
	view?: 'grid' | 'list'
}) {
	return (
		<div className='snap-rail gap-2 pb-1'>
			{MARKETPLACE_FILTERS.map((filter) => (
				<Link
					key={filter.id}
					href={filterHref(filter.id, query, view)}
					aria-current={filter.id === activeFilter ? 'page' : undefined}
					className={cn(
						'tap-press inline-flex shrink-0 items-center min-h-10 rounded-full border px-4 py-2 text-sm font-semibold transition',
						filter.id === activeFilter
							? 'border-primary bg-primary text-primary-foreground shadow-sm'
							: 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
					)}
				>
					{filter.label}
				</Link>
			))}
		</div>
	)
}

function filterHref(filterId: MarketplaceFilterId, query?: string, view?: 'grid' | 'list') {
	const params = new URLSearchParams()
	if (filterId !== 'all') params.set('filter', filterId)
	if (query?.trim()) params.set('q', query.trim())
	if (view === 'list') params.set('view', 'list')
	const serialized = params.toString()
	return serialized ? `/marketplace?${serialized}` : '/marketplace'
}
