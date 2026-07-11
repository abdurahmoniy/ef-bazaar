import { SlidersHorizontal, TrendingUp } from 'lucide-react'
import Link from 'next/link'

import { CardPickerField } from '@/components/marketplace/card-picker-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import {
	MARKETPLACE_FILTERS,
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

export function ListingFilters({
	activeFilter,
	query,
	minPrice,
	maxPrice,
	priceNegotiable,
	division,
	valuablePlayerId,
	valuablePlayerName,
	sortParam,
	attributes,
}: ListingFiltersProps) {
	const currentSortId = paramToSortId(sortParam)
	const attr = (key: string) => attributes?.[key] ?? ''

	return (
		<aside className='space-y-3 md:sticky md:top-32'>
			<div className='hidden md:block'>
				<QuickChips activeFilter={activeFilter} query={query} />
			</div>

			<form
				action='/marketplace'
				method='get'
				className='rounded-xl border border-border bg-card p-4 shadow-card'
			>
				{query && <input type='hidden' name='q' value={query} />}

				<div className='flex items-center gap-2 pb-3 text-sm font-bold text-foreground'>
					<SlidersHorizontal className='h-4 w-4 text-primary' />
					Filtrlar
				</div>

				<div className='space-y-3'>
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
						<div className='grid grid-cols-2 gap-2'>
							<Input
								name='attr.android_coins.min'
								type='number'
								inputMode='numeric'
								min={0}
								step={1000}
								placeholder='Android'
								aria-label='Android coin (kamida)'
								defaultValue={attr('android_coins.min')}
								className='h-10 rounded-lg'
							/>
							<Input
								name='attr.ios_coins.min'
								type='number'
								inputMode='numeric'
								min={0}
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
						<Checkbox
							name='attr.has_google_play_link'
							value='true'
							defaultChecked={attr('has_google_play_link') === 'true'}
							label='Google Play ulangan'
							className='p-2'
						/>
						<Checkbox
							name='attr.has_game_center_link'
							value='true'
							defaultChecked={attr('has_game_center_link') === 'true'}
							label='Game Center ulangan'
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

					<div className='grid grid-cols-2 gap-2 pt-1'>
						<Button type='submit' className='h-10 rounded-lg'>
							Qo'llash
						</Button>
						<Button asChild variant='outline' className='h-10 rounded-lg'>
							<Link href='/marketplace'>Tozalash</Link>
						</Button>
					</div>
				</div>
			</form>
		</aside>
	)
}

export function QuickChips({
	activeFilter,
	query,
}: {
	activeFilter: MarketplaceFilterId
	query?: string
}) {
	return (
		<div className='flex gap-2 overflow-x-auto no-scrollbar pb-1'>
			{MARKETPLACE_FILTERS.map((filter) => (
				<Link
					key={filter.id}
					href={filterHref(filter.id, query)}
					className={cn(
						'shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition',
						filter.id === activeFilter
							? 'border-primary bg-primary text-primary-foreground'
							: 'border-border bg-white text-muted-foreground hover:border-primary/40 hover:text-foreground',
					)}
				>
					{filter.label}
				</Link>
			))}
		</div>
	)
}

function filterHref(filterId: MarketplaceFilterId, query?: string) {
	const params = new URLSearchParams()
	if (filterId !== 'all') params.set('filter', filterId)
	if (query?.trim()) params.set('q', query.trim())
	const serialized = params.toString()
	return serialized ? `/marketplace?${serialized}` : '/marketplace'
}
