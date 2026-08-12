'use client'

import {
	AlertCircle,
	ArrowLeft,
	ArrowRight,
	Banknote,
	Check,
	CheckCircle2,
	Coins,
	Gamepad2,
	ImageIcon,
	ImagePlus,
	Loader2,
	Star,
	Trash2,
	X,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import type { ChangeEvent, DragEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
	CardPicker,
	type PlayerCard,
} from '@/components/marketplace/card-picker'
import {
	DivisionBadge,
	toDivisionLevel,
} from '@/components/marketplace/division-badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useTelegramMainButton } from '@/hooks/use-telegram-main-button'
import { SEEDED_LISTING_ATTRIBUTE_DEFINITIONS } from '@/lib/listing-form-data'
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api'
import { formatPriceUZS, normalizePlayerList } from '@/lib/marketplace-format'
import { listingMediaUrls } from '@/lib/marketplace-media'
import { cardRating } from '@/lib/marketplace-types'
import type {
	ListingAttributeDefinition,
	ListingCreateRequest,
	ListingResponse,
} from '@/lib/marketplace-types'
import { cn } from '@/lib/utils'

interface ListingFormProps {
	attributeDefinitions?: readonly ListingAttributeDefinition[]
	/** When provided, the form runs in edit mode: preloads values and PUTs to the listing id. */
	initialListing?: ListingResponse
}

interface PhotoEntry {
	id: string
	file: File
	previewUrl: string
}

interface WizardState {
	description: string
	price: string
	priceNegotiable: boolean
	attributes: AttributeMap
}

/**
 * Wizard-side attribute value. CARD_LIST is stored as an array of PlayerCard
 * objects (never a serialized string) so any downstream code can key off
 * card.efhubId directly and the picker doesn't have to reserialize on every
 * keystroke.
 */
export type AttributeValue = string | boolean | PlayerCard[]
export type AttributeMap = Record<string, AttributeValue>

const MIN_FILES = 1
const MAX_FILES = 10
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB
const MAX_DESCRIPTION = 2000
const ACCEPTED_IMAGE_TYPES =
	'image/jpeg,image/png,image/webp,image/heic,image/heif'

const STEPS = ['photos', 'basics', 'gameplay', 'pricing', 'review'] as const
type StepId = (typeof STEPS)[number]

/** Bump the version suffix when WizardState shape changes so old drafts are ignored. */
const DRAFT_KEY = 'efbazaar:listing-draft-v1'

const STEP_LABELS: Record<StepId, { title: string; subtitle: string }> = {
	photos: {
		title: 'Rasmlar',
		subtitle: `Kamida ${MIN_FILES} ta, eng ko'p ${MAX_FILES} ta`,
	},
	basics: {
		title: 'Tavsif',
		subtitle: "Akkountingiz haqida qisqacha ma'lumot",
	},
	gameplay: { title: "O'yin", subtitle: 'Division, Team Strength va coinlar' },
	pricing: { title: 'Narx', subtitle: 'Kelishilgan narx va shartlar' },
	review: {
		title: 'Tekshirish',
		subtitle: "Yuborishdan oldin natijani ko'ring",
	},
}

export function ListingForm({
	attributeDefinitions,
	initialListing,
}: ListingFormProps) {
	const router = useRouter()
	const editMode = initialListing !== undefined
	const [definitions, setDefinitions] = useState<
		readonly ListingAttributeDefinition[]
	>(attributeDefinitions ?? SEEDED_LISTING_ATTRIBUTE_DEFINITIONS)
	const [photos, setPhotos] = useState<PhotoEntry[]>([])
	const existingMediaUrls = useMemo(
		() => (initialListing ? listingMediaUrls(initialListing) : []),
		[initialListing],
	)
	const [step, setStep] = useState<StepId>('photos')
	const [state, setState] = useState<WizardState>(() => {
		const defs = attributeDefinitions ?? SEEDED_LISTING_ATTRIBUTE_DEFINITIONS
		if (initialListing) {
			return {
				description: initialListing.description,
				price: String(initialListing.price ?? ''),
				priceNegotiable: initialListing.priceNegotiable,
				attributes: attributesFromListing(initialListing.attributes, defs),
			}
		}
		return {
			description: '',
			price: '',
			priceNegotiable: false,
			attributes: initialAttributes(defs),
		}
	})
	const [submitError, setSubmitError] = useState<string | null>(null)
	const [pending, setPending] = useState(false)
	const submittedAt = useRef(0)

	useEffect(() => {
		if (attributeDefinitions) return
		const controller = new AbortController()
		;(async () => {
			try {
				const response = await fetch(buildMarketplaceApiPath('v1/attributes'), {
					headers: { Accept: 'application/json' },
					credentials: 'include',
					signal: controller.signal,
				})
				if (!response.ok) return
				const payload = await response.json()
				const normalized = normalizeAttributeDefinitions(payload)
				if (normalized.length > 0) {
					setDefinitions(normalized)
					setState((prev) => ({
						...prev,
						attributes: mergeAttributes(prev.attributes, normalized),
					}))
				}
			} catch {
				// fallback keeps the seeded definitions
			}
		})()
		return () => controller.abort()
	}, [attributeDefinitions])

	useEffect(() => {
		return () => {
			for (const photo of photos) URL.revokeObjectURL(photo.previewUrl)
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [])

	// Restore draft on mount (create mode only). Runs after SSR to avoid hydration
	// mismatch; a brief empty-form flash is acceptable in exchange for not
	// shipping localStorage lookups into the SSR pass.
	useEffect(() => {
		if (editMode) return
		const draft = readDraft()
		if (!draft) return
		setState((prev) => ({
			description:
				typeof draft.description === 'string'
					? draft.description
					: prev.description,
			price: typeof draft.price === 'string' ? draft.price : prev.price,
			priceNegotiable:
				typeof draft.priceNegotiable === 'boolean'
					? draft.priceNegotiable
					: prev.priceNegotiable,
			attributes: mergeAttributes(
				(draft.attributes as Record<string, string | boolean>) ?? {},
				definitions,
			),
		}))
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editMode])

	// Persist draft on every state change (create mode only). Photos are excluded
	// because File objects can't be serialised — user re-picks images on reload.
	useEffect(() => {
		if (editMode) return
		writeDraft(state)
	}, [state, editMode])

	const stepIndex = STEPS.indexOf(step)
	const stepErrors = useMemo(
		() =>
			validateStep(
				step,
				state,
				photos,
				definitions,
				editMode && existingMediaUrls.length > 0,
			),
		[step, state, photos, definitions, editMode, existingMediaUrls.length],
	)
	const canProceed = stepErrors.length === 0

	const goNext = useCallback(() => {
		if (!canProceed) return
		const next = STEPS[stepIndex + 1]
		if (next) setStep(next)
	}, [canProceed, stepIndex])

	const goPrev = useCallback(() => {
		const prev = STEPS[stepIndex - 1]
		if (prev) setStep(prev)
	}, [stepIndex])

	const handleSubmit = useCallback(async () => {
		// Guard: prevent double-submit on Telegram MainButton
		if (pending || Date.now() - submittedAt.current < 800) return
		submittedAt.current = Date.now()

		const keepExistingMedia = editMode && existingMediaUrls.length > 0
		const allErrors = STEPS.flatMap((id) =>
			validateStep(id, state, photos, definitions, keepExistingMedia),
		)
		if (allErrors.length > 0) {
			setSubmitError(allErrors[0])
			return
		}

		setSubmitError(null)
		setPending(true)
		try {
			const request = buildRequest(state, definitions)
			const formData = new FormData()
			formData.append(
				'data',
				new Blob([JSON.stringify(request)], { type: 'application/json' }),
			)
			for (const photo of photos) formData.append('files', photo.file)

			const isEdit = initialListing !== undefined
			const url = isEdit
				? buildMarketplaceApiPath(['v1', 'listings', initialListing.id])
				: buildMarketplaceApiPath('v1/listings')
			const response = await fetch(url, {
				method: isEdit ? 'PUT' : 'POST',
				headers: { Accept: 'application/json' },
				credentials: 'include',
				body: formData,
			})

			if (!response.ok) {
				const payload = await safeJson(response)
				setSubmitError(
					response.status === 401 || response.status === 403
						? 'Kirish talab qilinadi'
						: errorFromPayload(
								payload,
								isEdit ? "E'lon saqlanmadi" : "E'lon yaratilmadi",
							),
				)
				return
			}

			// Successful submit — drop any create-mode draft so the next open starts fresh.
			if (!isEdit) clearDraft()

			const payload = (await safeJson(
				response,
			)) as Partial<ListingResponse> | null
			const targetId = payload?.id ?? (isEdit ? initialListing.id : undefined)
			if (targetId) {
				router.push(`/marketplace/${targetId}`)
				router.refresh()
			} else {
				router.push('/marketplace')
				router.refresh()
			}
		} catch {
			setSubmitError("Tarmoq xatoligi. Qayta urinib ko'ring.")
		} finally {
			setPending(false)
		}
	}, [
		pending,
		state,
		photos,
		definitions,
		router,
		editMode,
		existingMediaUrls.length,
		initialListing,
	])

	const submitLabel = editMode ? 'Saqlash' : "E'lon yaratish"
	useTelegramMainButton({
		text: pending
			? 'Yuborilmoqda...'
			: step === 'review'
				? submitLabel
				: 'Davom etish',
		onClick: () => (step === 'review' ? handleSubmit() : goNext()),
		disabled: pending || (!canProceed && step !== 'review'),
		loading: pending,
	})

	return (
		<div className='space-y-4'>
			<StepIndicator current={step} />

			<div className='rounded-xl border border-border bg-card p-4 shadow-card sm:p-6'>
				<StepHeader step={step} />

				<div className='mt-4'>
					{step === 'photos' && (
						<PhotoStep
							photos={photos}
							setPhotos={setPhotos}
							errors={stepErrors}
							existingMediaUrls={existingMediaUrls}
						/>
					)}
					{step === 'basics' && (
						<BasicsStep state={state} setState={setState} errors={stepErrors} />
					)}
					{step === 'gameplay' && (
						<GameplayStep
							state={state}
							setState={setState}
							definitions={definitions}
							errors={stepErrors}
						/>
					)}
					{step === 'pricing' && (
						<PricingStep
							state={state}
							setState={setState}
							errors={stepErrors}
						/>
					)}
					{step === 'review' && (
						<ReviewStep
							state={state}
							photos={photos}
							definitions={definitions}
							existingMediaUrls={existingMediaUrls}
						/>
					)}
				</div>

				{submitError && (
					<div className='mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive'>
						<AlertCircle className='mt-0.5 h-4 w-4 shrink-0' />
						<span>{submitError}</span>
					</div>
				)}
			</div>

			<StepNav
				step={step}
				stepIndex={stepIndex}
				canProceed={canProceed}
				pending={pending}
				onPrev={goPrev}
				onNext={goNext}
				onSubmit={handleSubmit}
				submitLabel={submitLabel}
			/>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────
// Step indicator + header + nav

function StepIndicator({ current }: { current: StepId }) {
	const currentIndex = STEPS.indexOf(current)
	return (
		<ol className='grid grid-cols-5 gap-1'>
			{STEPS.map((id, index) => {
				const done = index < currentIndex
				const active = index === currentIndex
				return (
					<li key={id} className='flex flex-col items-center gap-1'>
						<span
							className={cn(
								'grid h-7 w-7 place-items-center rounded-full border-2 text-[11px] font-black transition',
								done && 'border-primary bg-primary text-primary-foreground',
								active && !done && 'border-primary bg-card text-primary',
								!done &&
									!active &&
									'border-border bg-card text-muted-foreground',
							)}
						>
							{done ? <Check className='h-3.5 w-3.5' /> : index + 1}
						</span>
						<span
							className={cn(
								'hidden text-[10px] font-bold uppercase tracking-wide sm:block',
								active || done ? 'text-foreground' : 'text-muted-foreground',
							)}
						>
							{STEP_LABELS[id].title}
						</span>
					</li>
				)
			})}
		</ol>
	)
}

function StepHeader({ step }: { step: StepId }) {
	const { title, subtitle } = STEP_LABELS[step]
	return (
		<div>
			<h2 className='text-lg font-black text-foreground'>{title}</h2>
			<p className='text-xs text-muted-foreground'>{subtitle}</p>
		</div>
	)
}

function StepNav({
	step,
	stepIndex,
	canProceed,
	pending,
	onPrev,
	onNext,
	onSubmit,
	submitLabel,
}: {
	step: StepId
	stepIndex: number
	canProceed: boolean
	pending: boolean
	onPrev: () => void
	onNext: () => void
	onSubmit: () => void
	submitLabel: string
}) {
	const isFirst = stepIndex === 0
	const isLast = step === 'review'

	return (
		<div className='flex items-center gap-2'>
			<Button
				type='button'
				variant='outline'
				onClick={onPrev}
				disabled={isFirst || pending}
				className='h-11 flex-1 sm:flex-none sm:px-6'
			>
				<ArrowLeft className='h-4 w-4' />
				Orqaga
			</Button>
			{isLast ? (
				<Button
					type='button'
					onClick={onSubmit}
					disabled={pending}
					className='h-11 flex-1 text-base'
				>
					{pending ? (
						<Loader2 className='h-4 w-4 animate-spin' />
					) : (
						<CheckCircle2 className='h-4 w-4' />
					)}
					{pending ? 'Yuborilmoqda...' : submitLabel}
				</Button>
			) : (
				<Button
					type='button'
					onClick={onNext}
					disabled={!canProceed}
					className='h-11 flex-1 text-base'
				>
					Davom etish
					<ArrowRight className='h-4 w-4' />
				</Button>
			)}
		</div>
	)
}

// ─────────────────────────────────────────────────────────────
// Photos step

function PhotoStep({
	photos,
	setPhotos,
	errors,
	existingMediaUrls,
}: {
	photos: PhotoEntry[]
	setPhotos: React.Dispatch<React.SetStateAction<PhotoEntry[]>>
	errors: string[]
	existingMediaUrls: string[]
}) {
	const hasExisting = existingMediaUrls.length > 0
	const replacing = hasExisting && photos.length > 0
	const [dragging, setDragging] = useState(false)
	const inputRef = useRef<HTMLInputElement>(null)

	const acceptedRegex = useMemo(() => /^image\/(jpeg|png|webp|heic|heif)$/i, [])

	function addFiles(files: FileList | File[]) {
		const incoming = Array.from(files).filter((file) => {
			if (!acceptedRegex.test(file.type)) return false
			if (file.size > MAX_FILE_BYTES) return false
			return true
		})
		if (incoming.length === 0) return
		setPhotos((prev) => {
			const remaining = Math.max(0, MAX_FILES - prev.length)
			const additions = incoming.slice(0, remaining).map((file) => ({
				id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
				file,
				previewUrl: URL.createObjectURL(file),
			}))
			return [...prev, ...additions]
		})
	}

	function removePhoto(id: string) {
		setPhotos((prev) => {
			const target = prev.find((entry) => entry.id === id)
			if (target) URL.revokeObjectURL(target.previewUrl)
			return prev.filter((entry) => entry.id !== id)
		})
	}

	function movePhoto(id: string, direction: -1 | 1) {
		setPhotos((prev) => {
			const index = prev.findIndex((entry) => entry.id === id)
			if (index < 0) return prev
			const target = index + direction
			if (target < 0 || target >= prev.length) return prev
			const next = prev.slice()
			const [entry] = next.splice(index, 1)
			next.splice(target, 0, entry)
			return next
		})
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault()
		setDragging(false)
		if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files)
	}

	return (
		<div className='space-y-3'>
			{hasExisting && (
				<div className='rounded-xl border border-border bg-muted/40 p-3'>
					<div className='mb-2 flex items-center justify-between text-xs'>
						<span className='font-bold uppercase tracking-wide text-muted-foreground'>
							Joriy rasmlar
						</span>
						<span
							className={cn(
								'font-semibold',
								replacing ? 'text-destructive' : 'text-muted-foreground',
							)}
						>
							{replacing
								? 'Yangi rasmlar bilan almashtiriladi'
								: `${existingMediaUrls.length} ta rasm saqlanadi`}
						</span>
					</div>
					<div className='grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-6'>
						{existingMediaUrls.map((url, index) => (
							<img
								key={url}
								src={url}
								alt={`Joriy rasm ${index + 1}`}
								loading='lazy'
								decoding='async'
								className={cn(
									'aspect-square w-full rounded-lg border-2 object-cover',
									replacing
										? 'border-destructive/40 opacity-40'
										: 'border-border',
								)}
							/>
						))}
					</div>
					<p className='mt-2 text-[11px] text-muted-foreground'>
						Yangi rasm yuklamasangiz, joriy rasmlar saqlanadi. Yuklaganingizda
						hammasi almashtiriladi.
					</p>
				</div>
			)}

			<div
				onDragOver={(event) => {
					event.preventDefault()
					setDragging(true)
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={handleDrop}
				className={cn(
					'flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center transition',
					dragging
						? 'border-primary bg-accent/40'
						: 'border-border bg-muted/40',
				)}
			>
				<ImagePlus className='h-6 w-6 text-primary' />
				<div className='text-sm font-semibold text-foreground'>
					{hasExisting
						? 'Yangi rasmlar bilan almashtirish'
						: 'Rasmlarni bu yerga tashlang'}
				</div>
				<div className='text-xs text-muted-foreground'>
					JPG, PNG, WebP, HEIC · fayl {formatMB(MAX_FILE_BYTES)}dan katta
					bo'lmasin
				</div>
				<Button
					type='button'
					variant='outline'
					size='sm'
					className='mt-2 rounded-lg'
					onClick={() => inputRef.current?.click()}
				>
					Fayl tanlash
				</Button>
				<input
					ref={inputRef}
					type='file'
					accept={ACCEPTED_IMAGE_TYPES}
					multiple
					className='sr-only'
					onChange={(event: ChangeEvent<HTMLInputElement>) => {
						if (event.target.files) addFiles(event.target.files)
						event.target.value = ''
					}}
				/>
			</div>

			{photos.length > 0 && (
				<div className='grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4'>
					{photos.map((photo, index) => (
						<div
							key={photo.id}
							className={cn(
								'relative overflow-hidden rounded-xl border-2 bg-muted',
								index === 0 ? 'border-primary' : 'border-border',
							)}
						>
							<img
								src={photo.previewUrl}
								alt={`Yuklangan rasm ${index + 1}`}
								className='aspect-square w-full object-cover'
							/>
							<div className='absolute inset-x-1 top-1 flex items-center justify-between'>
								{index === 0 && (
									<span className='inline-flex items-center gap-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-black text-primary-foreground'>
										<Star className='h-2.5 w-2.5' /> Muqova
									</span>
								)}
								<button
									type='button'
									onClick={() => removePhoto(photo.id)}
									aria-label="O'chirish"
									className='ml-auto grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80'
								>
									<X className='h-3 w-3' />
								</button>
							</div>
							<div className='absolute inset-x-1 bottom-1 flex items-center justify-between'>
								<button
									type='button'
									onClick={() => movePhoto(photo.id, -1)}
									disabled={index === 0}
									aria-label='Chapga surish'
									className='grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-30'
								>
									<ArrowLeft className='h-3 w-3' />
								</button>
								<button
									type='button'
									onClick={() => movePhoto(photo.id, 1)}
									disabled={index === photos.length - 1}
									aria-label="O'ngga surish"
									className='grid h-6 w-6 place-items-center rounded-full bg-black/60 text-white transition hover:bg-black/80 disabled:opacity-30'
								>
									<ArrowRight className='h-3 w-3' />
								</button>
							</div>
						</div>
					))}
				</div>
			)}

			<div className='flex items-center justify-between text-xs'>
				<span className='font-semibold text-muted-foreground'>
					{photos.length} / {MAX_FILES} ta yuklangan
				</span>
				{photos.length > 0 && (
					<button
						type='button'
						onClick={() =>
							setPhotos((prev) => {
								for (const p of prev) URL.revokeObjectURL(p.previewUrl)
								return []
							})
						}
						className='inline-flex items-center gap-1 text-destructive hover:underline'
					>
						<Trash2 className='h-3 w-3' /> Barchasini o'chirish
					</button>
				)}
			</div>

			<ErrorList errors={errors} />
		</div>
	)
}

// ─────────────────────────────────────────────────────────────
// Basics step

function BasicsStep({
	state,
	setState,
	errors,
}: {
	state: WizardState
	setState: React.Dispatch<React.SetStateAction<WizardState>>
	errors: string[]
}) {
	const searchableCards = playerCards(state.attributes.valuable_players)
	const coverage = searchableCards.length === 0
		? 'Hali tanlanmagan — e’lon o‘yinchi qidiruvida chiqmaydi.'
		: searchableCards.length <= 10
			? 'Boshlangan — ko‘proq qimmatli kartalar qo‘shsangiz moslik aniqroq bo‘ladi.'
			: 'Kuchli qamrov — xaridorlar bu tarkibni aniqroq topa oladi.'
	return (
		<div className='space-y-4'>
			<div className='space-y-2'>
				<Label htmlFor='description'>Tavsif</Label>
				<Textarea
					id='description'
					rows={6}
					maxLength={MAX_DESCRIPTION}
					placeholder='Akkount holati, muhim playerlar, platforma, hikoya...'
					value={state.description}
					onChange={(event) =>
						setState((prev) => ({
							...prev,
							description: event.target.value.slice(0, MAX_DESCRIPTION),
						}))
					}
				/>
				<div className='flex items-center justify-between text-[11px] text-muted-foreground'>
					<span>Kamida 10 belgi.</span>
					<span>
						{state.description.length} / {MAX_DESCRIPTION}
					</span>
				</div>
			</div>

			<div className='space-y-2'>
				<div className='flex items-end justify-between gap-3'>
					<Label htmlFor='valuable-players'>Qidiriladigan qimmatli kartalar (ixtiyoriy)</Label>
					<span className='text-xs font-bold tabular-nums'>{searchableCards.length} / 30</span>
				</div>
				<CardPicker
					id='valuable-players'
					mode='multi'
					max={30}
					selectedVariant='tile'
					value={playerCards(state.attributes.valuable_players)}
					onChange={(next) =>
						setState((prev) => ({
							...prev,
							attributes: { ...prev.attributes, valuable_players: next },
						}))
					}
				/>
				<p className='text-[11px] leading-relaxed text-muted-foreground'>
					Faqat shu yerda tanlangan kartalar xaridorning META va Dream Team
					qidiruvida hisoblanadi. {coverage}
				</p>
			</div>

			<ErrorList errors={errors} />
		</div>
	)
}

// ─────────────────────────────────────────────────────────────
// Gameplay step

// Store links can't be removed from an eFootball account — a transfer only
// moves the Konami ID, so a linked account is a caution flag for buyers.
const STORE_LINK_HINTS: Record<string, string> = {
	has_google_play_link:
		"Google Play ulanishini uzib bo'lmaydi — akkount faqat Konami ID orqali o'tkaziladi.",
	has_game_center_link:
		"Game Center ulanishini uzib bo'lmaydi — akkount faqat Konami ID orqali o'tkaziladi.",
}

const ATTRIBUTE_HINTS: Record<string, string> = {
	device_transfer_limit:
		"eFootball'da bir akkount oyiga 10 marta yangi qurilmaga o'tkaziladi. Shu oyda nechtasi qolganini yozing — savdo kamida 2 tasini oladi (moderator tekshiruvi va xaridorning kirishi). Limit har oy yangilanadi.",
}

function GameplayStep({
	state,
	setState,
	definitions,
	errors,
}: {
	state: WizardState
	setState: React.Dispatch<React.SetStateAction<WizardState>>
	definitions: readonly ListingAttributeDefinition[]
	errors: string[]
}) {
	const relevant = definitions.filter(
		(def) => def.active !== false && def.key !== 'valuable_players',
	)

	return (
		<div className='space-y-4'>
			<div className='grid gap-3 sm:grid-cols-2'>
				{relevant
					.filter((def) => def.type !== 'BOOLEAN')
					.map((def) => (
						<AttributeInput
							key={def.key}
							definition={def}
							state={state}
							setState={setState}
						/>
					))}
			</div>

			<div className='grid gap-2'>
				{relevant
					.filter((def) => def.type === 'BOOLEAN')
					.map((def) => (
						<Checkbox
							key={def.key}
							id={`attr-${def.key}`}
							label={def.labelUz}
							description={STORE_LINK_HINTS[def.key]}
							checked={Boolean(state.attributes[def.key])}
							onChange={(event) =>
								setState((prev) => ({
									...prev,
									attributes: {
										...prev.attributes,
										[def.key]: event.target.checked,
									},
								}))
							}
						/>
					))}
			</div>

			<ErrorList errors={errors} />
		</div>
	)
}

function AttributeInput({
	definition,
	state,
	setState,
}: {
	definition: ListingAttributeDefinition
	state: WizardState
	setState: React.Dispatch<React.SetStateAction<WizardState>>
}) {
	const value = state.attributes[definition.key]
	const raw =
		typeof value === 'string' ? value : value === undefined ? '' : String(value)

	function update(next: string) {
		setState((prev) => ({
			...prev,
			attributes: { ...prev.attributes, [definition.key]: next },
		}))
	}

	if (definition.type === 'ENUM') {
		const options = stringListConstraint(definition, 'options')
		const labels = stringMapConstraint(definition, 'option_labels_uz')
		if (definition.key === 'highest_division_level') {
			return (
				<div className='space-y-2 sm:col-span-2'>
					<Label>{definition.labelUz}</Label>
					<div
						role='radiogroup'
						aria-label={definition.labelUz}
						className='grid grid-cols-3 gap-2'
					>
						{options.map((option) => {
							const level = toDivisionLevel(option)
							if (!level) return null
							const selected = raw === option
							return (
								<button
									key={option}
									type='button'
									role='radio'
									aria-checked={selected}
									onClick={() => update(option)}
									className={cn(
										'flex flex-col items-center gap-1 rounded-xl border-2 bg-card p-3 transition',
										selected
											? 'border-primary shadow-card-hover'
											: 'border-border hover:border-primary/40',
									)}
								>
									<DivisionBadge level={level} size={56} glow={selected} />
									<span className='text-xs font-bold text-foreground'>
										{labels[option] ?? `Division ${option}`}
									</span>
								</button>
							)
						})}
					</div>
				</div>
			)
		}
		return (
			<div className='space-y-2'>
				<Label>{definition.labelUz}</Label>
				<Select
					value={raw}
					onChange={(event) => update(event.target.value)}
					className='h-11'
				>
					<option value='' disabled>
						Tanlang
					</option>
					{options.map((option) => (
						<option key={option} value={option}>
							{labels[option] ?? option}
						</option>
					))}
				</Select>
			</div>
		)
	}

	if (definition.type === 'INT' || definition.type === 'DECIMAL') {
		const min = numberConstraint(definition, 'min')
		const max = numberConstraint(definition, 'max')
		// Fields without a non-negative floor (coin balances can go below zero)
		// must not force the digit-only mobile keypad — it has no minus key.
		const allowsNegative = min === undefined || min < 0
		const isDivision = definition.key === 'highest_division_level'
		const icon = definition.key.includes('coin') ? (
			<Coins className='h-4 w-4 text-muted-foreground' />
		) : isDivision ? (
			<Gamepad2 className='h-4 w-4 text-muted-foreground' />
		) : null

		return (
			<div className='space-y-2'>
				<Label>{definition.labelUz}</Label>
				<div className='relative'>
					{icon && (
						<span className='absolute left-3 top-1/2 -translate-y-1/2'>
							{icon}
						</span>
					)}
					<Input
						type='number'
						inputMode={allowsNegative ? undefined : 'numeric'}
						min={min}
						max={max}
						step={definition.type === 'DECIMAL' ? '0.01' : '1'}
						value={raw}
						onChange={(event) => update(event.target.value)}
						className={cn('h-11', icon && 'pl-9')}
					/>
				</div>
				{ATTRIBUTE_HINTS[definition.key] && (
					<p className='text-xs leading-5 text-muted-foreground'>
						{ATTRIBUTE_HINTS[definition.key]}
					</p>
				)}
			</div>
		)
	}

	return (
		<div className='space-y-2'>
			<Label>{definition.labelUz}</Label>
			<Input
				value={raw}
				onChange={(event) => update(event.target.value)}
				className='h-11'
			/>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────
// Pricing step

function PricingStep({
	state,
	setState,
	errors,
}: {
	state: WizardState
	setState: React.Dispatch<React.SetStateAction<WizardState>>
	errors: string[]
}) {
	const parsed = Number(state.price)
	const hasValue = Number.isFinite(parsed) && parsed > 0

	return (
		<div className='space-y-4'>
			<div className='space-y-2'>
				<Label htmlFor='price'>Narx, so'm</Label>
				<div className='relative'>
					<Banknote className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
					<Input
						id='price'
						type='number'
						inputMode='numeric'
						min={0}
						step={10000}
						value={state.price}
						onChange={(event) =>
							setState((prev) => ({ ...prev, price: event.target.value }))
						}
						className='h-14 pl-9 text-2xl font-black text-[hsl(var(--price))]'
					/>
				</div>
				{hasValue && (
					<p className='text-sm font-semibold text-muted-foreground'>
						= <span className='text-foreground'>{formatPriceUZS(parsed)}</span>
					</p>
				)}
			</div>

			<Checkbox
				id='price-negotiable'
				label='Savdolashish mumkin'
				description='Xaridor narxni muhokama qilishni taklif qilishi mumkin.'
				checked={state.priceNegotiable}
				onChange={(event) =>
					setState((prev) => ({
						...prev,
						priceNegotiable: event.target.checked,
					}))
				}
			/>

			<ErrorList errors={errors} />
		</div>
	)
}

// ─────────────────────────────────────────────────────────────
// Review step

function ReviewStep({
	state,
	photos,
	definitions,
	existingMediaUrls,
}: {
	state: WizardState
	photos: PhotoEntry[]
	definitions: readonly ListingAttributeDefinition[]
	existingMediaUrls: string[]
}) {
	const priceNum = Number(state.price)
	const priceLabel = Number.isFinite(priceNum) ? formatPriceUZS(priceNum) : '—'
	const usingExisting = photos.length === 0 && existingMediaUrls.length > 0

	return (
		<div className='space-y-4'>
			<div className='grid gap-2 sm:grid-cols-4'>
				{photos.slice(0, 4).map((photo, index) => (
					<img
						key={photo.id}
						src={photo.previewUrl}
						alt={`Preview ${index + 1}`}
						className='aspect-square w-full rounded-lg object-cover'
					/>
				))}
				{usingExisting &&
					existingMediaUrls
						.slice(0, 4)
						.map((url, index) => (
							<img
								key={url}
								src={url}
								alt={`Preview ${index + 1}`}
								loading='lazy'
								decoding='async'
								className='aspect-square w-full rounded-lg object-cover'
							/>
						))}
				{photos.length === 0 && !usingExisting && (
					<div className='grid h-24 place-items-center rounded-lg bg-muted text-muted-foreground'>
						<ImageIcon className='h-6 w-6' />
					</div>
				)}
			</div>

			<div className='grid gap-3 rounded-lg bg-muted/50 p-4'>
				<div className='flex items-baseline justify-between'>
					<span className='text-xs font-bold uppercase text-muted-foreground'>
						Narx
					</span>
					<span className='text-2xl font-black text-[hsl(var(--price))]'>
						{priceLabel}
					</span>
				</div>
				<div className='flex items-center justify-between text-sm'>
					<span className='text-muted-foreground'>Savdolashish</span>
					<span className='font-semibold'>
						{state.priceNegotiable ? 'Mumkin' : "Yo'q"}
					</span>
				</div>
			</div>

			<div className='rounded-lg border border-border bg-card p-4'>
				<div className='text-xs font-bold uppercase text-muted-foreground'>
					Tavsif
				</div>
				<p className='mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground'>
					{state.description || (
						<span className='text-muted-foreground'>—</span>
					)}
				</p>
			</div>

			<div className='rounded-lg border border-border bg-card p-4'>
				<div className='text-xs font-bold uppercase text-muted-foreground'>
					Xususiyatlar
				</div>
				<dl className='mt-2 grid grid-cols-1 gap-x-6 sm:grid-cols-2'>
					{definitions
						.filter((def) => def.active !== false)
						.map((def) => (
							<div
								key={def.key}
								className='flex items-center justify-between gap-2 border-b border-dashed border-border py-1.5 text-sm'
							>
								<dt className='text-muted-foreground'>{def.labelUz}</dt>
								<dd className='font-semibold text-foreground'>
									{renderAttributeValue(state.attributes[def.key], def)}
								</dd>
							</div>
						))}
				</dl>
			</div>
		</div>
	)
}

// ─────────────────────────────────────────────────────────────
// Helpers

function ErrorList({ errors }: { errors: string[] }) {
	if (errors.length === 0) return null
	return (
		<ul className='space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>
			{errors.map((error) => (
				<li key={error} className='flex items-start gap-2'>
					<AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
					{error}
				</li>
			))}
		</ul>
	)
}

/** Narrow an unknown wizard-state value to a PlayerCard[] safely. */
function playerCards(value: unknown): PlayerCard[] {
	if (!Array.isArray(value)) return []
	return value.filter(
		(item): item is PlayerCard =>
			!!item &&
			typeof item === 'object' &&
			typeof (item as PlayerCard).efhubId === 'number' &&
			typeof (item as PlayerCard).name === 'string',
	)
}

function renderAttributeValue(
	value: unknown,
	def?: ListingAttributeDefinition,
) {
	if (value === undefined || value === '')
		return <span className='text-muted-foreground'>—</span>
	if (typeof value === 'boolean') return value ? 'Ha' : "Yo'q"
	if (Array.isArray(value)) {
		const cards = playerCards(value)
		if (cards.length === 0)
			return <span className='text-muted-foreground'>—</span>
		return cards
			.map(
				(c) =>
					`${c.name}${cardRating(c) ? ` ${cardRating(c)}` : ''}${c.cardType ? ` ${c.cardType}` : ''}`,
			)
			.join(', ')
	}
	if (typeof value === 'string' && def?.type === 'ENUM') {
		const labels = stringMapConstraint(def, 'option_labels_uz')
		return labels[value] ?? value
	}
	return String(value)
}

function defaultAttributeValue(
	def: ListingAttributeDefinition,
): AttributeValue {
	if (def.type === 'BOOLEAN') return false
	if (def.type === 'CARD_LIST') return []
	if (def.type === 'ENUM') {
		const preset = def.constraints?.default
		if (typeof preset === 'string') return preset
	}
	return ''
}

function initialAttributes(definitions: readonly ListingAttributeDefinition[]) {
	const attributes: AttributeMap = {}
	for (const def of definitions) {
		attributes[def.key] = defaultAttributeValue(def)
	}
	return attributes
}

function mergeAttributes(
	current: AttributeMap,
	definitions: readonly ListingAttributeDefinition[],
) {
	const next: AttributeMap = {}
	for (const def of definitions) {
		if (def.key in current) next[def.key] = current[def.key]
		else next[def.key] = defaultAttributeValue(def)
	}
	return next
}

/**
 * Turn a persisted listing.attributes payload into the wizard's edit-state shape
 * (strings for numbers, booleans for BOOLEAN, comma-joined for LIST_STRING).
 */
function attributesFromListing(
	raw: Record<string, unknown>,
	definitions: readonly ListingAttributeDefinition[],
): AttributeMap {
	const out: AttributeMap = {}
	for (const def of definitions) {
		const value = raw?.[def.key]
		if (def.type === 'BOOLEAN') {
			out[def.key] = value === true || value === 'true'
			continue
		}
		if (value === undefined || value === null) {
			out[def.key] = defaultAttributeValue(def)
			continue
		}
		if (def.type === 'CARD_LIST') {
			out[def.key] = normalizeCardListPayload(value)
			continue
		}
		if (def.type === 'LIST_STRING') {
			if (Array.isArray(value)) {
				out[def.key] = value
					.filter((entry) => typeof entry === 'string')
					.join(', ')
			} else if (typeof value === 'string') {
				out[def.key] = value
			} else {
				out[def.key] = ''
			}
			continue
		}
		out[def.key] = typeof value === 'string' ? value : String(value)
	}
	return out
}

/**
 * The backend stores CARD_LIST items with snake_case keys (efhub_id,
 * overall_rating, image_url) — that's the shape it sends back on GET and
 * expects on write. The picker works with camelCase. Bridge the two on
 * hydrate so the picker doesn't need to know about the wire format.
 */
function normalizeCardListPayload(value: unknown): PlayerCard[] {
	if (!Array.isArray(value)) return []
	const out: PlayerCard[] = []
	for (const raw of value) {
		if (!raw || typeof raw !== 'object') continue
		const item = raw as Record<string, unknown>
		const efhubId = item.efhubId ?? item.efhub_id
		const playerId = item.playerId ?? item.player_id
		const metaTierRaw = item.metaTier ?? item.meta_tier
		const name = item.name
		if (typeof efhubId !== 'number' || typeof playerId !== 'string' || typeof name !== 'string') continue
		out.push({
			efhubId,
			playerId,
			name,
			team: typeof item.team === 'string' ? item.team : undefined,
			position: typeof item.position === 'string' ? item.position : undefined,
			playingStyle:
				typeof (item.playingStyle ?? item.playing_style) === 'string'
					? String(item.playingStyle ?? item.playing_style)
					: undefined,
			overallRating:
				typeof (item.overallRating ?? item.overall_rating) === 'number'
					? Number(item.overallRating ?? item.overall_rating)
					: undefined,
			maxOverallRating:
				typeof (item.maxOverallRating ?? item.max_overall_rating) === 'number'
					? Number(item.maxOverallRating ?? item.max_overall_rating)
					: undefined,
			cardType:
				typeof (item.cardType ?? item.card_type) === 'string'
					? String(item.cardType ?? item.card_type)
					: undefined,
			metaTier:
				metaTierRaw === 'META' || metaTierRaw === 'NORMAL'
					? metaTierRaw
					: undefined,
			imageUrl:
				typeof (item.imageUrl ?? item.image_url) === 'string'
					? String(item.imageUrl ?? item.image_url)
					: undefined,
			skills: Array.isArray(item.skills)
				? item.skills.filter((s): s is string => typeof s === 'string')
				: undefined,
		})
	}
	return out
}

/** Convert a picker-side card to the snake_case payload the backend expects. */
function cardToApiPayload(card: PlayerCard): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		efhub_id: card.efhubId,
		player_id: card.playerId,
		name: card.name,
	}
	if (card.team !== undefined) payload.team = card.team
	if (card.position !== undefined) payload.position = card.position
	if (card.playingStyle !== undefined) payload.playing_style = card.playingStyle
	if (card.overallRating !== undefined)
		payload.overall_rating = card.overallRating
	// Snapshot the maxed OVR too — the listing must keep showing the number the
	// seller saw, even if a later scrape changes the card.
	if (card.maxOverallRating !== undefined)
		payload.max_overall_rating = card.maxOverallRating
	if (card.cardType !== undefined) payload.card_type = card.cardType
	if (card.metaTier !== undefined) payload.meta_tier = card.metaTier
	if (card.imageUrl !== undefined) payload.image_url = card.imageUrl
	if (card.skills !== undefined) payload.skills = card.skills
	return payload
}

function validateStep(
	step: StepId,
	state: WizardState,
	photos: PhotoEntry[],
	definitions: readonly ListingAttributeDefinition[],
	keepExistingMedia = false,
): string[] {
	const errors: string[] = []

	if (step === 'photos') {
		// In edit mode, existing media satisfies the MIN_FILES requirement as long as
		// the user hasn't started uploading replacements. If they add any new photo,
		// the replacement fully takes over and standard MIN_FILES/MAX_FILES apply.
		if (photos.length === 0 && !keepExistingMedia) {
			errors.push(`Kamida ${MIN_FILES} ta rasm yuklang.`)
		}
		if (photos.length > 0 && photos.length < MIN_FILES) {
			errors.push(`Kamida ${MIN_FILES} ta rasm yuklang.`)
		}
		if (photos.length > MAX_FILES)
			errors.push(`Ko'pi bilan ${MAX_FILES} ta rasm.`)
	}

	if (step === 'basics') {
		if (state.description.trim().length < 10) {
			errors.push("Tavsif kamida 10 belgidan iborat bo'lsin.")
		}
	}

	if (step === 'gameplay') {
		for (const def of definitions) {
			if (def.active === false) continue
			if (def.key === 'valuable_players') continue
			const value = state.attributes[def.key]
			if (def.type === 'BOOLEAN') continue
			const raw = typeof value === 'string' ? value.trim() : ''
			if (def.required && !raw) {
				errors.push(`${def.labelUz} maydonini to'ldiring.`)
				continue
			}
			if (!raw) continue
			if (def.type === 'INT') {
				const num = Number(raw)
				if (!Number.isInteger(num))
					errors.push(`${def.labelUz} butun son bo'lishi kerak.`)
				else {
					const min = numberConstraint(def, 'min')
					const max = numberConstraint(def, 'max')
					const minSellable = numberConstraint(def, 'min_sellable')
					if (min !== undefined && num < min)
						errors.push(`${def.labelUz} ${min} dan kichik bo'lmasin.`)
					if (max !== undefined && num > max)
						errors.push(`${def.labelUz} ${max} dan katta bo'lmasin.`)
					// Truthful value, untradeable account — say why, not "min".
					if (minSellable !== undefined && num >= (min ?? num) && num < minSellable)
						errors.push(
							def.key === 'device_transfer_limit'
								? `Qurilma almashtirish limiti ${num} ta qolgan. Sotuv uchun kamida ${minSellable} ta kerak: moderator tekshiruvi va xaridorning kirishi uchun. Limit har oy yangilanadi.`
								: `${def.labelUz} sotuvga qo'yish uchun kamida ${minSellable} bo'lsin.`,
						)
				}
			}
			if (def.type === 'DECIMAL') {
				const num = Number(raw)
				if (!Number.isFinite(num))
					errors.push(`${def.labelUz} son bo'lishi kerak.`)
			}
		}
	}

	if (step === 'pricing') {
		const price = Number(state.price)
		if (!Number.isFinite(price) || price <= 0)
			errors.push("Narx 0 dan katta bo'lishi kerak.")
		if (price > 1_000_000_000) errors.push('Narx juda katta.')
	}

	return errors
}

function buildRequest(
	state: WizardState,
	definitions: readonly ListingAttributeDefinition[],
): ListingCreateRequest {
	const attributes: Record<string, unknown> = {}
	for (const def of definitions) {
		if (def.active === false) continue
		const raw = state.attributes[def.key]
		if (def.type === 'BOOLEAN') {
			attributes[def.key] = Boolean(raw)
			continue
		}
		if (def.type === 'CARD_LIST') {
			const cards = playerCards(raw)
			if (cards.length > 0) attributes[def.key] = cards.map(cardToApiPayload)
			continue
		}
		if (typeof raw !== 'string' || !raw.trim()) continue
		switch (def.type) {
			case 'INT': {
				const num = Number(raw)
				if (Number.isInteger(num)) attributes[def.key] = num
				break
			}
			case 'DECIMAL': {
				const num = Number(raw)
				if (Number.isFinite(num)) attributes[def.key] = num
				break
			}
			case 'LIST_STRING': {
				const list = normalizePlayerList(raw)
				if (list.length > 0) attributes[def.key] = list
				break
			}
			default:
				attributes[def.key] = raw.trim()
		}
	}

	return {
		description: state.description.trim(),
		price: Number(state.price),
		priceNegotiable: state.priceNegotiable,
		attributes,
	}
}

function numberConstraint(definition: ListingAttributeDefinition, key: string) {
	const raw = definition.constraints?.[key]
	const value =
		typeof raw === 'number' || typeof raw === 'string'
			? Number(raw)
			: Number.NaN
	return Number.isFinite(value) ? value : undefined
}

function stringListConstraint(
	definition: ListingAttributeDefinition,
	key: string,
) {
	const raw = definition.constraints?.[key]
	return Array.isArray(raw)
		? raw.filter((item): item is string => typeof item === 'string')
		: []
}

function stringMapConstraint(
	definition: ListingAttributeDefinition,
	key: string,
): Record<string, string> {
	const raw = definition.constraints?.[key]
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
	const out: Record<string, string> = {}
	for (const [k, v] of Object.entries(raw)) {
		if (typeof v === 'string') out[k] = v
	}
	return out
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return typeof payload === 'object' && payload !== null
}

function normalizeAttributeDefinitions(
	payload: unknown,
): ListingAttributeDefinition[] {
	if (!Array.isArray(payload)) return []
	return payload
		.filter(
			(entry): entry is ListingAttributeDefinition =>
				isRecord(entry) &&
				typeof entry.key === 'string' &&
				typeof entry.labelUz === 'string' &&
				typeof entry.required === 'boolean' &&
				isAttributeType(entry.type),
		)
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
}

function isAttributeType(value: unknown) {
	return (
		value === 'INT' ||
		value === 'DECIMAL' ||
		value === 'BOOLEAN' ||
		value === 'STRING' ||
		value === 'TEXT' ||
		value === 'LIST_STRING' ||
		value === 'ENUM' ||
		value === 'CARD_LIST'
	)
}

async function safeJson(response: Response) {
	const text = await response.text()
	if (!text) return null
	try {
		return JSON.parse(text) as unknown
	} catch {
		return null
	}
}

function errorFromPayload(payload: unknown, fallback: string) {
	if (!isRecord(payload)) return fallback
	if (typeof payload.message === 'string') return payload.message
	if (typeof payload.error === 'string') return payload.error
	return fallback
}

function formatMB(bytes: number) {
	return `${Math.round(bytes / 1024 / 1024)} MB`
}

/**
 * Read a persisted draft. Returns null on server, unavailable storage, missing
 * key, or malformed JSON — callers should treat null as "no draft to restore".
 */
function readDraft(): Partial<WizardState> | null {
	if (typeof window === 'undefined') return null
	try {
		const raw = window.localStorage.getItem(DRAFT_KEY)
		if (!raw) return null
		const parsed = JSON.parse(raw) as unknown
		return isRecord(parsed) ? (parsed as Partial<WizardState>) : null
	} catch {
		return null
	}
}

function writeDraft(state: WizardState) {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.setItem(DRAFT_KEY, JSON.stringify(state))
	} catch {
		// storage full / private mode / SecurityError — dropping the draft is fine
	}
}

function clearDraft() {
	if (typeof window === 'undefined') return
	try {
		window.localStorage.removeItem(DRAFT_KEY)
	} catch {
		// ignore
	}
}
