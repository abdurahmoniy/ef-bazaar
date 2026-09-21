'use client';

import {
	filterListingPlatformAttributes,
	isListingAttributeApplicable,
	isMobileListingPlatform,
} from '@/lib/listing-platform-attributes';

import {
	AlertCircle,
	ArrowLeft,
	ArrowRight,
	Banknote,
	Camera,
	CheckCircle2,
	Coins,
	Edit3,
	Eye,
	Gamepad2,
	ImageIcon,
	ImagePlus,
	Loader2,
	Megaphone,
	ShieldCheck,
	Smartphone,
	Sparkles,
	Star,
	Trash2,
	X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { ChangeEvent, DragEvent } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
	CardPicker,
	type PlayerCard,
} from '@/components/marketplace/card-picker';
import {
	DivisionBadge,
	toDivisionLevel,
} from '@/components/marketplace/division-badge';
import { TipCallout } from '@/components/help/tip-callout';
import { Button } from '@/components/ui/button';
import { TelegramRequiredPrompt } from '@/components/auth/telegram-required-prompt';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MIN_LISTING_PRICE_SOM, SEEDED_LISTING_ATTRIBUTE_DEFINITIONS } from '@/lib/listing-form-data';
import { ChannelPicker } from '@/components/marketplace/channel-picker';
import { MeasuredBottomBar } from '@/components/marketplace/measured-bottom-bar';
import { formatAdvertisingPrice, totalPrice, type ChannelCard } from '@/lib/partner-channels';
import { listingAdvertisingHref } from '@/lib/listing-advertising';
import { buildMarketplaceApiPath } from '@/lib/marketplace-client-api';
import { formatPriceUZS, normalizePlayerList } from '@/lib/marketplace-format';
import { listingMediaUrl, listingMediaUrls } from '@/lib/marketplace-media';
import { cardRating } from '@/lib/marketplace-types';
import type {
	ListingAttributeDefinition,
	ListingCreateRequest,
	ListingResponse,
} from '@/lib/marketplace-types';
import {
	createAccount,
	replaceAccountMedia,
	updateAccount,
} from '@/lib/accounts-client';
import type { UserAccountResponse } from '@/lib/accounts-types';
import {
	stepsFor,
	type ListingFormMode,
	type StepId,
} from '@/lib/listing-form-steps';
import { getTelegramWebApp } from '@/lib/telegram';
import { telegramHaptic } from '@/lib/telegram-shell';
import { cn } from '@/lib/utils';
import { MIN_TRADE_PRICE_SOM, sellerProceedsSom, tradeFeeSom } from '@/lib/trade-commission';
import { getPublicTradeCommissionConfig } from '@/lib/payment-client';
import type { TradeCommissionConfig } from '@/lib/payment-types';

interface ListingFormProps {
	botUsername?: string;
	attributeDefinitions?: readonly ListingAttributeDefinition[];
	/** When provided, the form runs in edit mode: preloads values and PUTs to the listing id. */
	initialListing?: ListingResponse;
	/**
	 * `account` — forma "Akkountlarim" uchun ishlaydi: narx qadami yo'q va
	 * saqlash akkount API'siga ketadi. Sotuv shartlari akkountga tegishli
	 * emas, ular bozorga chiqarishda so'raladi.
	 */
	mode?: ListingFormMode;
	/** Akkount rejimida tahrirlanayotgan akkount. */
	initialAccount?: UserAccountResponse;
}



interface PhotoEntry {
	id: string;
	file: File;
	previewUrl: string;
}

interface WizardState {
	/** Faqat akkount rejimida ishlatiladi — e'londa bunday maydon yo'q. */
	title: string;
	description: string;
	price: string;
	priceNegotiable: boolean;
	attributes: AttributeMap;
}

/**
 * Wizard-side attribute value. CARD_LIST is stored as an array of PlayerCard
 * objects (never a serialized string) so any downstream code can key off
 * card.efhubId directly and the picker doesn't have to reserialize on every
 * keystroke.
 */
export type AttributeValue = string | boolean | PlayerCard[];
export type AttributeMap = Record<string, AttributeValue>;

const MIN_FILES = 1;
const MAX_FILES = 10;
const MAX_FILE_BYTES = 8 * 1024 * 1024; // 8 MB
const MAX_DESCRIPTION = 2000;
const ACCEPTED_IMAGE_TYPES =
	'image/jpeg,image/png,image/webp,image/heic,image/heif';


/** Version service answers so legacy unchecked defaults can be safely migrated. */
const DRAFT_KEY = 'efbazaar:listing-draft-v3';
const LEGACY_DRAFT_KEY = 'efbazaar:listing-draft-v2';
const SERVICE_LINK_KEYS = ['has_google_play_link', 'has_game_center_link'];
/** Alohida kalit: yarim to'ldirilgan akkount e'lon qoralamasiga aralashmasin. */
const ACCOUNT_DRAFT_KEY = 'efbazaar:account-draft-v1';

const STEP_META: Record<
	StepId,
	{ badge: string; title: string; subtitle: string }
> = {
	photos: {
		badge: '1-qadam / 4',
		title: 'Akkount rasmlarini yuklang',
		subtitle: 'Jamoa tarkibi va yulduzlar skrinshotlari',
	},
	basics: {
		badge: '2-qadam / 4',
		title: 'Tavsif va qimmatli kartalar',
		subtitle: 'Akkount holati va asosiy yulduzlar',
	},
	gameplay: {
		badge: '3-qadam / 4',
		title: 'O‘yin ko‘rsatkichlari',
		subtitle: 'Platforma, division va jamoa ko‘rsatkichlari',
	},
	pricing: {
		badge: '4-qadam / 4',
		title: 'Sotuv narxini belgilang',
		subtitle: 'Qulay narx va sof summa hisobi',
	},
	review: {
		badge: 'Tasdiqlash',
		title: 'E‘lonni tasdiqlang',
		subtitle: 'Ma‘lumotlarni tekshiring va joylang',
	},
};

export function ListingForm({
	attributeDefinitions,
	initialListing,
	botUsername = '',
	mode = 'listing',
	initialAccount,
}: ListingFormProps) {
	const router = useRouter();
	const [telegramRequired, setTelegramRequired] = useState(false);
	const accountMode = mode === 'account';
	// useMemo: har renderda yangi massiv qaytsa quyidagi callback'lar
	// bog'liqliklari doim o'zgarib turardi.
	const steps = useMemo(() => stepsFor(mode), [mode]);
	const editMode = initialListing !== undefined || initialAccount !== undefined;
	// Save first. The dedicated advertising page owns any paid order.
	const [advertising, setAdvertising] = useState(false);
	const [channels, setChannels] = useState<ChannelCard[]>([]);
	const advertisingAllowed = !initialListing || initialListing.status === 'ACTIVE';
	const advertisingTotal = totalPrice(channels, channels.map(channel => channel.channelId));
	const [definitions, setDefinitions] = useState<
		readonly ListingAttributeDefinition[]
	>(attributeDefinitions ?? SEEDED_LISTING_ATTRIBUTE_DEFINITIONS);
	const [photos, setPhotos] = useState<PhotoEntry[]>([]);
	const existingMediaUrls = useMemo(() => {
		if (initialListing) return listingMediaUrls(initialListing);
		if (initialAccount) {
			return initialAccount.mediaMessageIds
				.map((id) => listingMediaUrl(id))
				.filter((url): url is string => Boolean(url));
		}
		return [];
	}, [initialListing, initialAccount]);
	const [step, setStep] = useState<StepId>('photos');
	const [touchedSteps, setTouchedSteps] = useState<Set<StepId>>(new Set());
	const [state, setState] = useState<WizardState>(() => {
		const defs = attributeDefinitions ?? SEEDED_LISTING_ATTRIBUTE_DEFINITIONS;
		if (initialListing) {
			return {
				title: '',
				description: initialListing.description,
				price: String(initialListing.price ?? ''),
				priceNegotiable: initialListing.priceNegotiable,
				attributes: attributesFromListing(initialListing.attributes, defs),
			};
		}
		if (initialAccount) {
			return {
				title: initialAccount.title ?? '',
				description: initialAccount.description ?? '',
				price: '',
				priceNegotiable: false,
				attributes: attributesFromListing(initialAccount.attributes, defs),
			};
		}
		return {
			title: '',
			description: '',
			price: '',
			priceNegotiable: false,
			attributes: initialAttributes(defs),
		};
	});
	const [draftRestored, setDraftRestored] = useState(false);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [pending, setPending] = useState(false);
	const [commissionConfig, setCommissionConfig] = useState<TradeCommissionConfig | null>(null);
	const submittedAt = useRef(0);

	useEffect(() => {
		getPublicTradeCommissionConfig()
			.then((cfg) => setCommissionConfig(cfg))
			.catch(() => {});
	}, []);

	useEffect(() => {
		if (attributeDefinitions) return;
		const controller = new AbortController();
		(async () => {
			try {
				const response = await fetch(buildMarketplaceApiPath('v1/attributes'), {
					headers: { Accept: 'application/json' },
					credentials: 'include',
					signal: controller.signal,
				});
				if (!response.ok) return;
				const payload = await response.json();
				const normalized = normalizeAttributeDefinitions(payload);
				if (normalized.length > 0) {
					setDefinitions(normalized);
					setState((prev) => ({
						...prev,
						attributes: mergeAttributes(prev.attributes, normalized),
					}));
				}
			} catch {
				// fallback keeps the seeded definitions
			}
		})();
		return () => controller.abort();
	}, [attributeDefinitions]);

	useEffect(() => {
		return () => {
			for (const photo of photos) URL.revokeObjectURL(photo.previewUrl);
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	// Restore draft on mount (create mode only).
	useEffect(() => {
		if (editMode) return;
		const draft = readDraft(accountMode);
		if (!draft) return;
		// Browser files cannot be restored from localStorage. Keep the text, then
		// ask for photos again before allowing the wizard to continue.
		setStep('photos');
		setDraftRestored(true);
		if (draft.state) {
			setState((prev) => ({
				title: typeof draft.state?.title === 'string' ? draft.state.title : prev.title,
				description:
					typeof draft.state?.description === 'string'
						? draft.state.description
						: prev.description,
				price: typeof draft.state?.price === 'string' ? draft.state.price : prev.price,
				priceNegotiable:
					typeof draft.state?.priceNegotiable === 'boolean'
						? draft.state.priceNegotiable
						: prev.priceNegotiable,
				attributes: mergeAttributes(
					(draft.state?.attributes as Record<string, string | boolean>) ?? {},
					definitions,
				),
			}));
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [editMode]);

	// Persist draft on state changes.
	useEffect(() => {
		if (editMode) return;
		writeDraft(step, state, accountMode);
	}, [step, state, editMode, accountMode]);

	useEffect(() => {
		setSubmitError(null);
	}, [state, photos]);

	const stepIndex = steps.indexOf(step);
	const stepErrors = useMemo(
		() =>
			validateStep(
				step,
				state,
				photos,
				definitions,
				// Akkount rasmsiz ham saqlanadi — u hali qoralama. Rasm
				// bozorga chiqarishda talab qilinadi, u yerda e'lon
				// validatsiyasi ishlaydi.
				accountMode || (editMode && existingMediaUrls.length > 0),
			),
		[step, state, photos, definitions, editMode, existingMediaUrls.length, accountMode],
	);
	const canProceed = stepErrors.length === 0;

	const goNext = useCallback(() => {
		setTouchedSteps((prev) => new Set(prev).add(step));
		if (!canProceed) {
			telegramHaptic(getTelegramWebApp(), 'error', false);
			return;
		}
		const next = steps[stepIndex + 1];
		if (next) {
			setStep(next);
			telegramHaptic(getTelegramWebApp(), 'selection', false);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}, [canProceed, step, stepIndex, steps]);

	const goPrev = useCallback(() => {
		const prev = steps[stepIndex - 1];
		if (prev) {
			setStep(prev);
			telegramHaptic(getTelegramWebApp(), 'selection', false);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}, [stepIndex, steps]);

	const goToStep = useCallback((targetStep: StepId) => {
		const targetIndex = steps.indexOf(targetStep);
		if (targetIndex < stepIndex) {
			setStep(targetStep);
			telegramHaptic(getTelegramWebApp(), 'selection', false);
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}, [stepIndex, steps]);

	/**
	 * Akkountni saqlash: avval ma'lumot (JSON), keyin rasmlar (multipart).
	 *
	 * <p>Ikki so'rov, chunki rasm yuklash Telegram'ga boradi va uni JSON
	 * bilan aralashtirib bo'lmaydi. Rasm tanlanmagan bo'lsa ikkinchi so'rov
	 * umuman ketmaydi — akkountdagi eski rasmlar joyida qoladi.
	 */
	const submitAccount = useCallback(async () => {
		const attributes = buildRequest(state, definitions).attributes ?? {};
		const payload = {
			title: state.title.trim() ? state.title.trim() : null,
			description: state.description.trim(),
			attributes,
		};

		const saved = initialAccount
			? await updateAccount(initialAccount.id, payload)
			: await createAccount(payload);
		if (!saved.ok) {
			setSubmitError(saved.message);
			telegramHaptic(getTelegramWebApp(), 'error', false);
			return;
		}

		if (photos.length > 0) {
			const uploaded = await replaceAccountMedia(
				saved.data.id,
				photos.map((photo) => photo.file),
			);
			if (!uploaded.ok) {
				// Akkount saqlandi, rasmlar esa yo'q: shuni aynan shunday aytamiz,
				// aks holda odam hammasini qaytadan to'ldirishga tushardi.
				setSubmitError(`Akkount saqlandi, lekin rasmlar yuklanmadi: ${uploaded.message}`);
				telegramHaptic(getTelegramWebApp(), 'error', false);
				return;
			}
		}

		if (!editMode) clearDraft(true);
		telegramHaptic(getTelegramWebApp(), 'success', false);
		router.push('/profile?tab=accounts');
		router.refresh();
	}, [state, definitions, initialAccount, photos, editMode, router]);

	const handleSubmit = useCallback(async () => {
		if (pending || Date.now() - submittedAt.current < 800) return;
		submittedAt.current = Date.now();

		const keepExistingMedia =
			accountMode || (editMode && existingMediaUrls.length > 0);
		const invalidStep = steps.find((id) =>
			validateStep(id, state, photos, definitions, keepExistingMedia).length > 0,
		);
		if (invalidStep) {
			setStep(invalidStep);
			setTouchedSteps((prev) => new Set(prev).add(invalidStep));
			setSubmitError(null);
			window.scrollTo({ top: 0, behavior: 'smooth' });
			telegramHaptic(getTelegramWebApp(), 'error', false);
			return;
		}

		setSubmitError(null);
		setPending(true);
		try {
			if (accountMode) {
				await submitAccount();
				return;
			}
			const request = buildRequest(state, definitions);
			const formData = new FormData();
			formData.append(
				'data',
				new Blob([JSON.stringify(request)], { type: 'application/json' }),
			);
			for (const photo of photos) formData.append('files', photo.file);

			const isEdit = initialListing !== undefined;
			const url = isEdit
				? buildMarketplaceApiPath(['v1', 'listings', initialListing.id])
				: buildMarketplaceApiPath('v1/listings');
			const response = await fetch(url, {
				method: isEdit ? 'PUT' : 'POST',
				headers: { Accept: 'application/json' },
				credentials: 'include',
				body: formData,
			});

			if (!response.ok) {
				const payload = await safeJson(response);
				if (payload && typeof payload === 'object' && 'code' in payload && payload.code === 'telegram_required') {
					setTelegramRequired(true);
					return;
				}
				setSubmitError(
					response.status === 401 || response.status === 403
						? 'Kirish talab qilinadi'
						: errorFromPayload(
								payload,
								isEdit ? "E'lon saqlanmadi" : "E'lon yaratilmadi",
							),
				);
				telegramHaptic(getTelegramWebApp(), 'error', false);
				return;
			}

			if (!isEdit) clearDraft();
			telegramHaptic(getTelegramWebApp(), 'success', false);

			const payload = (await safeJson(
				response,
			)) as Partial<ListingResponse> | null;
			const targetId = payload?.id ?? initialListing?.id;
			if (targetId) {
				router.push(advertising && advertisingAllowed
					? listingAdvertisingHref(targetId, channels.map(channel => channel.channelId))
					: `/marketplace/${targetId}`);
				router.refresh();
			} else {
				router.push('/marketplace');
				router.refresh();
			}
		} catch {
			setSubmitError("Tarmoq xatoligi. Qayta urinib ko'ring.");
			telegramHaptic(getTelegramWebApp(), 'error', false);
		} finally {
			setPending(false);
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
		advertising,
		advertisingAllowed,
		channels,
		accountMode,
		steps,
		submitAccount,
	]);

	const submitLabel = accountMode
		? (editMode ? 'Saqlash' : 'Akkountni saqlash')
		: advertising && advertisingAllowed
			? (editMode ? 'Saqlash va reklama' : 'Yaratish va reklama')
			: (editMode ? 'Saqlash' : "E'lon yaratish");

	const showErrors = touchedSteps.has(step);
	const progressPercent = Math.min(
		100,
		Math.round(((stepIndex + 1) / (steps.length - 1)) * 100),
	);
	// Reklama e'longa tegishli: akkount hali bozorda emas.
	const advertisingOffer = !accountMode && advertisingAllowed && (step === 'pricing' || step === 'review') && (
		<div className="space-y-3" aria-label="E’lon reklamasi">
			<div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
				<div className="flex items-start gap-3">
					<Megaphone aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-primary dark:text-secondary" />
					<div><h3 className="text-base font-bold">Ko‘proq xaridorga ko‘rsating</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">Telegram kanallari va narxlarni ko‘ring. Reklama ixtiyoriy.</p></div>
				</div>
				{advertising ? <>
					<p className="text-sm font-semibold">{channels.length > 0 ? `${channels.length} ta kanal · ${formatAdvertisingPrice(advertisingTotal)}` : 'Kanallarni keyingi sahifada ham tanlashingiz mumkin.'}</p>
					<p className="text-sm leading-relaxed text-muted-foreground">Avval e’lon saqlanadi. Reklama buyurtmasini keyingi sahifada narxlarni tekshirib, alohida tasdiqlaysiz. Hozir reklama uchun pul olinmaydi.</p>
					<div className="flex flex-wrap gap-2">
						{step === 'review' && <Button type="button" variant="outline" disabled={pending} onClick={() => goToStep('pricing')}>Kanallarni o‘zgartirish</Button>}
						<Button type="button" variant="ghost" disabled={pending} onClick={() => { setAdvertising(false); setChannels([]); }}>Hozir reklamasiz davom etish</Button>
					</div>
				</> : <Button type="button" variant="outline" className="min-h-12 w-full sm:w-auto" disabled={pending} onClick={() => { setAdvertising(true); if (step === 'review') goToStep('pricing'); }}>Kanallarni tanlash <ArrowRight aria-hidden /></Button>}
			</div>
			{advertising && step === 'pricing' && <ChannelPicker selected={channels} onChange={setChannels} disabled={pending} />}
		</div>
	);

	return (
		<div className='space-y-3 pb-4'>
			{telegramRequired && (
				<TelegramRequiredPrompt purpose="listing" botUsername={botUsername} onClose={() => setTelegramRequired(false)} />
			)}
			{/* Top Seamless Progress Track */}
			<div className='h-1 w-full overflow-hidden rounded-full bg-muted/40'>
				<div
					className='h-full rounded-full bg-primary transition-all duration-500 ease-out'
					style={{ width: `${progressPercent}%` }}
				/>
			</div>

			{/* Human Step Header */}
			<div className='space-y-0.5 px-0.5'>
				<p className='text-[11px] font-bold uppercase tracking-wider text-primary'>
					{step === 'review'
						? STEP_META.review.badge
						: `${stepIndex + 1}-qadam / ${steps.length - 1}`}
				</p>
				<div className='flex items-baseline justify-between gap-2'>
					<h2 className='text-lg sm:text-xl font-black text-foreground tracking-tight'>
						{accountMode && step === 'review' ? 'Akkountni tasdiqlang' : STEP_META[step].title}
					</h2>
					<span className='text-[11px] text-muted-foreground hidden xs:inline shrink-0'>
						{STEP_META[step].subtitle}
					</span>
				</div>
			</div>

			{draftRestored && step === 'photos' && photos.length === 0 && (
				<p role='status' className='rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm'>
					Tavsif va narx saqlandi. Rasmlar saqlanmaydi — davom etish uchun ularni qayta tanlang.
				</p>
			)}

			{/* Step Main Card */}
			<div className='rounded-2xl border border-border bg-card p-3.5 shadow-card sm:p-5 transition-all'>
				{step === 'photos' && (
					<PhotoStep
						photos={photos}
						setPhotos={setPhotos}
						errors={showErrors ? stepErrors : []}
						existingMediaUrls={existingMediaUrls}
					/>
				)}
				{step === 'basics' && accountMode && (
					<div className='mb-4 space-y-1.5'>
						<Label htmlFor='account-title'>Akkount nomi</Label>
						<Input
							id='account-title'
							value={state.title}
							maxLength={120}
							placeholder='Asosiy akkount'
							onChange={(e) => setState((prev) => ({ ...prev, title: e.target.value }))}
						/>
						<p className='text-[11px] text-muted-foreground'>
							Faqat sizga ko&apos;rinadi — ro&apos;yxatda akkountlarni ajratish uchun.
						</p>
					</div>
				)}
				{step === 'basics' && (
					<BasicsStep
						state={state}
						setState={setState}
						errors={showErrors ? stepErrors : []}
					/>
				)}
				{step === 'gameplay' && (
					<GameplayStep
						state={state}
						setState={setState}
						definitions={definitions}
						errors={showErrors ? stepErrors : []}
					/>
				)}
				{step === 'pricing' && (
					<PricingStep
						state={state}
						setState={setState}
						errors={showErrors ? stepErrors : []}
						commissionConfig={commissionConfig}
						advertisingOffer={advertisingOffer}
					/>
				)}
				{step === 'review' && advertisingOffer && <div className="mb-4">{advertisingOffer}</div>}
				{step === 'review' && (
					<ReviewStep
						state={state}
						photos={photos}
						definitions={definitions}
						existingMediaUrls={existingMediaUrls}
						onEditStep={goToStep}
						commissionConfig={commissionConfig}
						accountMode={accountMode}
					/>
				)}

				{submitError && (
					<div role='alert' className='mt-3 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-2.5 text-xs text-destructive'>
						<AlertCircle className='mt-0.5 h-3.5 w-3.5 shrink-0' />
						<span>{submitError}</span>
					</div>
				)}
			</div>

			{/* Sticky Mobile Action Navigation */}
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
	);
}

// ─────────────────────────────────────────────────────────────
// Navigation

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
	step: StepId;
	stepIndex: number;
	canProceed: boolean;
	pending: boolean;
	onPrev: () => void;
	onNext: () => void;
	onSubmit: () => void;
	submitLabel: string;
}) {
	const isFirst = stepIndex === 0;
	const isLast = step === 'review';

	return (
		<MeasuredBottomBar className='fixed inset-x-0 bottom-0 z-40 border-t border-border/80 bg-card/95 backdrop-blur-md pl-[max(1rem,var(--app-content-safe-left))] pr-[max(1rem,var(--app-content-safe-right))] py-3 pb-[calc(0.75rem+var(--app-content-safe-bottom))] sm:static sm:z-auto sm:border-0 sm:bg-transparent sm:p-0 sm:pb-0'>
			<div className='mx-auto flex max-w-3xl items-center gap-2.5'>
				<Button
					type='button'
					variant='outline'
					onClick={onPrev}
					disabled={isFirst || pending}
					className='min-h-12 flex-1 font-bold sm:flex-none sm:px-6'
				>
					<ArrowLeft className='h-4 w-4 mr-1' />
					Orqaga
				</Button>

				{isLast ? (
					<Button
						type='button'
						onClick={onSubmit}
						disabled={pending}
						className='min-h-12 flex-[2] text-sm sm:text-base font-black shadow-md shadow-primary/20'
					>
						{pending ? (
							<Loader2 className='mr-2 h-4 w-4 animate-spin' />
						) : (
							<CheckCircle2 className='mr-2 h-4 w-4' />
						)}
						{pending ? 'Yuborilmoqda...' : submitLabel}
					</Button>
				) : (
					<Button
						type='button'
						onClick={onNext}
						className='min-h-12 flex-[2] text-sm sm:text-base font-black shadow-md shadow-primary/20'
					>
						Davom etish
						<ArrowRight className='ml-2 h-4 w-4' />
					</Button>
				)}
			</div>
		</MeasuredBottomBar>
	);
}

// ─────────────────────────────────────────────────────────────
// Photos step

function PhotoStep({
	photos,
	setPhotos,
	errors,
	existingMediaUrls,
}: {
	photos: PhotoEntry[];
	setPhotos: React.Dispatch<React.SetStateAction<PhotoEntry[]>>;
	errors: string[];
	existingMediaUrls: string[];
}) {
	const hasExisting = existingMediaUrls.length > 0;
	const [dragging, setDragging] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const photoError = errors[0];

	const [rejectedFiles, setRejectedFiles] = useState<string[]>([]);

	function addFiles(files: FileList | File[]) {
		const additions: PhotoEntry[] = [];
		const rejected: string[] = [];
		for (const file of Array.from(files)) {
			const supported = /^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)
				|| (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
			if (!supported) {
				rejected.push(`${file.name}: format qo‘llab-quvvatlanmaydi.`);
			} else if (file.size > MAX_FILE_BYTES) {
				rejected.push(`${file.name}: 8 MB dan katta.`);
			} else if (photos.length + additions.length >= MAX_FILES) {
				rejected.push(`${file.name}: ko‘pi bilan ${MAX_FILES} ta rasm tanlash mumkin.`);
			} else {
				additions.push({
					id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
					file,
					previewUrl: URL.createObjectURL(file),
				});
			}
		}
		setRejectedFiles(rejected);
		if (additions.length > 0) setPhotos((prev) => [...prev, ...additions]);
		telegramHaptic(getTelegramWebApp(), rejected.length > 0 ? 'error' : 'selection', false);
	}

	function removePhoto(id: string) {
		setPhotos((prev) => {
			const target = prev.find((entry) => entry.id === id);
			if (target) URL.revokeObjectURL(target.previewUrl);
			return prev.filter((entry) => entry.id !== id);
		});
		telegramHaptic(getTelegramWebApp(), 'selection', false);
	}

	function movePhoto(id: string, direction: -1 | 1) {
		setPhotos((prev) => {
			const index = prev.findIndex((entry) => entry.id === id);
			if (index < 0) return prev;
			const target = index + direction;
			if (target < 0 || target >= prev.length) return prev;
			const next = prev.slice();
			const [entry] = next.splice(index, 1);
			next.splice(target, 0, entry);
			return next;
		});
		telegramHaptic(getTelegramWebApp(), 'selection', false);
	}

	function handleDrop(event: DragEvent<HTMLDivElement>) {
		event.preventDefault();
		setDragging(false);
		if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
	}

	return (
		<div className='space-y-3'>
			{/* Tappable Compact Upload Dropzone */}
			<div
				role='button'
				tabIndex={0}
				onClick={() => inputRef.current?.click()}
				onKeyDown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
				}}
				onDragOver={(event) => {
					event.preventDefault();
					setDragging(true);
				}}
				onDragLeave={() => setDragging(false)}
				onDrop={handleDrop}
				className={cn(
					'tap-press flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed p-4 text-center transition cursor-pointer select-none',
					photoError
						? 'border-destructive bg-destructive/5'
						: dragging
							? 'border-primary bg-primary/10'
							: 'border-border hover:border-primary/50 bg-muted/20 hover:bg-muted/40',
				)}
			>
				<div className='flex items-center gap-2'>
					<span className='grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary'>
						<Camera className='h-4 w-4' />
					</span>
					<span className='grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary'>
						<ImagePlus className='h-4 w-4' />
					</span>
				</div>
				<div>
					<p className='text-xs font-bold text-foreground'>
						{hasExisting
							? 'Yangi rasmlar yuklash'
							: 'Rasm tanlash yoki bu yerga tashlang'}
					</p>
					<p className='text-[11px] text-muted-foreground'>
						JPG, PNG, WEBP, HEIC, HEIF · har biri 8 MB gacha · 1–10 ta rasm
					</p>
				</div>

				<input
					ref={inputRef}
					type='file'
					accept={ACCEPTED_IMAGE_TYPES}
					multiple
					className='sr-only'
					onChange={(event: ChangeEvent<HTMLInputElement>) => {
						if (event.target.files) addFiles(event.target.files);
						event.target.value = '';
					}}
				/>
			</div>

			{rejectedFiles.length > 0 && (
				<ul role='alert' className='space-y-1 text-xs text-destructive'>
					{rejectedFiles.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
				</ul>
			)}

			{photoError && (
				<p className='flex items-center gap-1 text-[11px] font-bold text-destructive px-1'>
					<AlertCircle className='h-3.5 w-3.5 shrink-0' />
					{photoError}
				</p>
			)}

			{/* Existing photos preview in edit mode */}
			{hasExisting && photos.length === 0 && (
				<div className='rounded-xl border border-border bg-muted/20 p-2.5'>
					<div className='mb-1.5 flex items-center justify-between text-[11px]'>
						<span className='font-bold text-muted-foreground'>
							Joriy rasmlar ({existingMediaUrls.length} ta)
						</span>
					</div>
					<div className='grid grid-cols-4 gap-1.5'>
						{existingMediaUrls.map((url, index) => (
							<img
								key={url}
								src={url}
								alt={`Joriy rasm ${index + 1}`}
								loading='lazy'
								decoding='async'
								className='aspect-square w-full rounded-lg border object-cover border-border'
							/>
						))}
					</div>
				</div>
			)}

			{/* Uploaded Photos Grid */}
			{photos.length > 0 && (
				<div className='space-y-1.5'>
					<div className='flex items-center justify-between text-[11px] font-bold text-muted-foreground px-1'>
						<span>Yuklangan rasmlar ({photos.length}/{MAX_FILES})</span>
						<button
							type='button'
							onClick={() =>
								setPhotos((prev) => {
									for (const p of prev) URL.revokeObjectURL(p.previewUrl);
									return [];
								})
							}
							className='inline-flex items-center gap-1 text-destructive hover:underline'
						>
							<Trash2 className='h-3 w-3' /> Tozalash
						</button>
					</div>

					<div className='grid grid-cols-3 gap-1.5 sm:grid-cols-4'>
						{photos.map((photo, index) => (
							<div
								key={photo.id}
								className={cn(
									'relative overflow-hidden rounded-xl border-2 bg-muted transition',
									index === 0 ? 'border-amber-400 ring-1 ring-amber-400/30' : 'border-border',
								)}
							>
								<img
									src={photo.previewUrl}
									alt={`Yuklangan rasm ${index + 1}`}
									className='aspect-square w-full object-cover'
								/>

								{/* Top Badges & Actions */}
								<div className='absolute inset-x-1 top-1 flex items-center justify-between'>
									{index === 0 ? (
										<span className='inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-0.5 text-[9px] font-black text-amber-950 shadow'>
											<Star className='h-2 w-2 fill-current' /> Muqova
										</span>
									) : (
										<button
											type='button'
											onClick={() => {
												setPhotos((prev) => {
													const next = prev.slice();
													const [target] = next.splice(index, 1);
													next.unshift(target);
													return next;
												});
												telegramHaptic(getTelegramWebApp(), 'selection', false);
											}}
											className='rounded-full bg-black/60 px-1.5 py-0.5 text-[8px] font-bold text-white backdrop-blur-sm transition'
										>
											Muqova
										</button>
									)}

									<button
										type='button'
										onClick={() => removePhoto(photo.id)}
										aria-label="O'chirish"
										className='ml-auto grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-destructive active:scale-90'
									>
										<X className='h-3 w-3' />
									</button>
								</div>

								{/* Bottom Reorder Controls */}
								<div className='absolute inset-x-1 bottom-1 flex items-center justify-between'>
									<button
										type='button'
										onClick={() => movePhoto(photo.id, -1)}
										disabled={index === 0}
										aria-label='Chapga surish'
										className='grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/90 disabled:opacity-20 active:scale-90'
									>
										<ArrowLeft className='h-3 w-3' />
									</button>
									<span className='text-[9px] font-black text-white drop-shadow'>
										{index + 1}
									</span>
									<button
										type='button'
										onClick={() => movePhoto(photo.id, 1)}
										disabled={index === photos.length - 1}
										aria-label="O'ngga surish"
										className='grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white backdrop-blur-sm transition hover:bg-black/90 disabled:opacity-20 active:scale-90'
									>
										<ArrowRight className='h-3 w-3' />
									</button>
								</div>
							</div>
						))}

						{/* Add more tile */}
						{photos.length < MAX_FILES && (
							<button
								type='button'
								onClick={() => inputRef.current?.click()}
								className='tap-press flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border/80 bg-muted/20 text-muted-foreground transition hover:border-primary/50 hover:bg-muted/40 hover:text-foreground'
							>
								<ImagePlus className='h-5 w-5 text-primary' />
								<span className='text-[10px] font-bold'>Qo&apos;shish</span>
							</button>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// Basics step

function BasicsStep({
	state,
	setState,
	errors,
}: {
	state: WizardState;
	setState: React.Dispatch<React.SetStateAction<WizardState>>;
	errors: string[];
}) {
	const descError = errors.find((e) => e.includes('Tavsif'));
	const searchableCards = playerCards(state.attributes.valuable_players);

	return (
		<div className='space-y-3.5'>
			{/* Description */}
			<div className='space-y-1.5'>
				<div className='flex items-center justify-between'>
					<Label htmlFor='description' className='text-xs font-bold'>
						Tavsif <span className='text-destructive'>*</span>
					</Label>
					<span className='text-[10px] tabular-nums font-semibold text-muted-foreground'>
						{state.description.length} / {MAX_DESCRIPTION}
					</span>
				</div>
				<Textarea
					id='description'
					rows={2}
					maxLength={MAX_DESCRIPTION}
					placeholder='Akkount holati, muhim o‘yinchilar, Konami ID...'
					value={state.description}
					onChange={(event) =>
						setState((prev) => ({
							...prev,
							description: event.target.value.slice(0, MAX_DESCRIPTION),
						}))
					}
					className={cn(
						'rounded-xl text-base sm:text-sm leading-relaxed min-h-[64px] max-h-[120px]',
						descError && 'border-destructive focus-visible:ring-destructive',
					)}
				/>
				{descError && (
					<p className='flex items-center gap-1 text-[11px] font-bold text-destructive'>
						<AlertCircle className='h-3.5 w-3.5 shrink-0' />
						{descError}
					</p>
				)}
			</div>

			{/* Searchable Valuable Players */}
			<div className='space-y-1.5 pt-1'>
				<div className='flex items-center justify-between'>
					<Label htmlFor='valuable-players' className='text-xs font-bold'>
						Qimmatli kartalar <span className='font-normal text-muted-foreground'>(ixtiyoriy)</span>
					</Label>
					<span className='text-[10px] font-black text-primary tabular-nums'>
						{searchableCards.length} / 30
					</span>
				</div>

				<CardPicker
					id='valuable-players'
					mode='multi'
					max={30}
					selectedVariant='tile'
					showMetaShortcut={false}
					placeholder="O'yinchi qidirish (Messi, Mbappe...)"
					value={searchableCards}
					onChange={(next) =>
						setState((prev) => ({
							...prev,
							attributes: { ...prev.attributes, valuable_players: next },
						}))
					}
				/>
			</div>

			<TipCallout
				variant='tip'
				dismissible
				dismissKey='listing_form_players_tip'
				learnMoreHref='/help#buyer'
				learnMoreLabel='Yulduz kartalar qo‘llanmasi'
			>
				Akkountingizdagi eng muhim Epic, Big Time va Show Time kartalarni tanlang. Xaridorlar shu kartalar bo‘yicha e‘loningizni qidirib topishi mumkin.
			</TipCallout>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// Gameplay step

function GameplayStep({
	state,
	setState,
	definitions,
	errors,
}: {
	state: WizardState;
	setState: React.Dispatch<React.SetStateAction<WizardState>>;
	definitions: readonly ListingAttributeDefinition[];
	errors: string[];
}) {
	const relevant = definitions.filter(
		(def) => def.active !== false && def.key !== 'valuable_players' && isListingAttributeApplicable(def.key, state.attributes.platform),
	);

	const divDef = relevant.find((d) => d.key === 'highest_division_level');
	const tsDef = relevant.find((d) => d.key === 'team_strength');
	const limitDef = relevant.find((d) => d.key === 'device_transfer_limit');
	const platformDef = relevant.find((d) => d.key === 'platform');
	const androidCoinDef = relevant.find((d) => d.key === 'android_coins');
	const iosCoinDef = relevant.find((d) => d.key === 'ios_coins');
	const coinDef = relevant.find((d) => d.key === 'coins');
	const mobile = isMobileListingPlatform(state.attributes.platform);
	const boolDefs = relevant
		.filter((d) => d.type === 'BOOLEAN')
		.sort((a, b) => {
			// Align with coins grid: Google Play under Android Coin (col 1), Game Center under iOS Coin (col 2)
			const rank = (key: string) =>
				key === 'has_google_play_link' ? 0 : key === 'has_game_center_link' ? 1 : 2;
			const diff = rank(a.key) - rank(b.key);
			return diff !== 0 ? diff : (a.position ?? 0) - (b.position ?? 0);
		});

	const handledKeys = new Set([
		'highest_division_level',
		'team_strength',
		'device_transfer_limit',
		'platform',
		'android_coins',
		'ios_coins',
		'coins',
		...boolDefs.map((d) => d.key),
	]);
	const otherDefs = relevant.filter((d) => !handledKeys.has(d.key));

	function updateAttr(key: string, value: AttributeValue) {
		setState((prev) => ({
			...prev,
			attributes: key === 'platform'
				? filterListingPlatformAttributes({ ...prev.attributes, [key]: value })
				: { ...prev.attributes, [key]: value },
		}));
	}

	return (
		<div className='space-y-3'>
			{/* Platform determines which fields follow. */}
			{platformDef && (
				<PlatformSelector
					definition={platformDef}
					value={String(state.attributes[platformDef.key] || 'MOBILE')}
					onChange={(val) => updateAttr(platformDef.key, val)}
					error={errors.find((e) => e.includes(platformDef.labelUz))}
				/>
			)}

			{/* Division Selector */}
			{divDef && (
				<DivisionSelector
					definition={divDef}
					value={String(state.attributes[divDef.key] || '')}
					onChange={(val) => updateAttr(divDef.key, val)}
					error={errors.find((e) => e.includes(divDef.labelUz))}
				/>
			)}

			{/* Shared team strength and Mobile transfer limit */}
			<div className={cn('grid gap-2', limitDef && 'grid-cols-2')}>
				{tsDef && (
					<TeamStrengthInput
						definition={tsDef}
						value={String(state.attributes[tsDef.key] || '')}
						onChange={(val) => updateAttr(tsDef.key, val)}
						error={errors.find((e) => e.includes(tsDef.labelUz))}
					/>
				)}
				{limitDef && (
					<TransferLimitInput
						definition={limitDef}
						value={String(state.attributes[limitDef.key] || '')}
						onChange={(val) => updateAttr(limitDef.key, val)}
						error={errors.find((e) => e.includes(limitDef.labelUz) || e.includes('limiti'))}
					/>
				)}
			</div>


			{/* Mobile coin balances */}
			{(androidCoinDef || iosCoinDef) && (
				<div className='grid grid-cols-2 gap-2'>
					{androidCoinDef && (
						<CoinInput
							label='Android Coin'
							value={String(state.attributes[androidCoinDef.key] || '')}
							onChange={(val) => updateAttr(androidCoinDef.key, val)}
							error={errors.find((e) => e.includes(androidCoinDef.labelUz))}
						/>
					)}
					{iosCoinDef && (
						<CoinInput
							label='iOS Coin'
							value={String(state.attributes[iosCoinDef.key] || '')}
							onChange={(val) => updateAttr(iosCoinDef.key, val)}
							error={errors.find((e) => e.includes(iosCoinDef.labelUz))}
						/>
					)}
				</div>
			)}

			{coinDef && (
				<CoinInput
					label={coinDef.labelUz}
					value={String(state.attributes[coinDef.key] ?? '')}
					onChange={(val) => updateAttr(coinDef.key, val)}
					error={errors.find((e) => e.includes(coinDef.labelUz))}
				/>
			)}

			{/* Applicable boolean attributes */}
			{boolDefs.length > 0 && (
				<div className='grid grid-cols-2 gap-2 pt-0.5'>
					{boolDefs.map((def) => {
						const value = state.attributes[def.key];
						const error = errors.find((message) => message.includes(def.labelUz));
						return (
							<div key={def.key} className='space-y-1.5'>
								<Label htmlFor={def.key}>{def.labelUz.replace(' ulangan', '')}</Label>
								<Select
									id={def.key}
									value={typeof value === 'boolean' ? String(value) : ''}
									aria-invalid={Boolean(error)}
									aria-describedby={error ? `${def.key}-error` : undefined}
									onChange={(event) => updateAttr(def.key, event.target.value === '' ? '' : event.target.value === 'true')}
								>
									<option value=''>Holatini tanlang</option>
									<option value='true'>{SERVICE_LINK_KEYS.includes(def.key) ? 'Ulangan' : 'Ha'}</option>
									<option value='false'>{SERVICE_LINK_KEYS.includes(def.key) ? 'Ulanmagan' : "Yo‘q"}</option>
								</Select>
								{error && <p id={`${def.key}-error`} role='alert' className='text-xs text-destructive'>{error}</p>}
							</div>
						);
					})}
				</div>
			)}

			{/* Any other remaining attributes */}
			{otherDefs.length > 0 && (
				<div className='grid gap-2 sm:grid-cols-2 pt-1'>
					{otherDefs.map((def) => (
						<AttributeInput
							key={def.key}
							definition={def}
							state={state}
							setState={setState}
							error={errors.find((e) => e.includes(def.labelUz))}
						/>
					))}
				</div>
			)}

			{mobile && <TipCallout
				variant='info'
				dismissible
				dismissKey='listing_form_coins_tip'
				learnMoreHref='/help#faq-coins-split'
				learnMoreLabel='Tangalar haqida'
			>
				Android va iOS tangalari Konami qoidalariga ko‘ra bir-biriga o‘tmaydi. Shu sababli ikkala platforma tangalarini to‘g‘ri va alohida kiriting.
			</TipCallout>}
		</div>
	);
}

function DivisionSelector({
	definition,
	value,
	onChange,
	error,
}: {
	definition: ListingAttributeDefinition;
	value: string;
	onChange: (val: string) => void;
	error?: string;
}) {
	const options = stringListConstraint(definition, 'options');
	const labels = stringMapConstraint(definition, 'option_labels_uz');

	return (
		<div className='space-y-1.5'>
			<div className='flex items-center justify-between'>
				<Label className='text-xs font-bold'>
					{definition.labelUz} <span className='text-destructive'>*</span>
				</Label>
			</div>
			<div
				role='radiogroup'
				aria-label={definition.labelUz}
				className='grid grid-cols-4 gap-1.5'
			>
				{options.map((option) => {
					const level = toDivisionLevel(option);
					if (!level) return null;
					const selected = value === option;
					return (
						<button
							key={option}
							type='button'
							role='radio'
							aria-checked={selected}
							onClick={() => {
								onChange(option);
								telegramHaptic(getTelegramWebApp(), 'selection', false);
							}}
							className={cn(
								'tap-press flex flex-col items-center justify-center gap-1 rounded-xl border-2 bg-card py-2 px-1 transition select-none',
								selected
									? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
									: 'border-border hover:border-primary/40',
							)}
						>
							<DivisionBadge level={level} size={28} glow={selected} />
							<span className='text-[11px] font-black text-foreground truncate'>
								{labels[option] ?? `Div ${option}`}
							</span>
						</button>
					);
				})}
			</div>
			{error && (
				<p className='flex items-center gap-1 text-[11px] font-bold text-destructive'>
					<AlertCircle className='h-3 w-3 shrink-0' />
					{error}
				</p>
			)}
		</div>
	);
}

function TeamStrengthInput({
	definition,
	value,
	onChange,
	error,
}: {
	definition: ListingAttributeDefinition;
	value: string;
	onChange: (val: string) => void;
	error?: string;
}) {
	return (
		<div className='space-y-1'>
			<div className='flex items-center justify-between'>
				<Label className='text-xs font-bold'>
					Team Strength <span className='text-destructive'>*</span>
				</Label>
				<div className='flex gap-1'>
					{[3150, 3200].map((preset) => (
						<button
							key={preset}
							type='button'
							onClick={() => onChange(String(preset))}
							className='rounded bg-muted px-1 py-0.5 text-[9px] font-bold text-muted-foreground hover:text-primary transition'
						>
							{preset}+
						</button>
					))}
				</div>
			</div>
			<div className='relative'>
				<Sparkles className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-500' />
				<Input
					type='number'
					inputMode='numeric'
					placeholder='3150'
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') e.currentTarget.blur();
					}}
					className={cn(
						'h-10 rounded-xl pl-8 pr-2 text-base font-bold sm:text-sm',
						error && 'border-destructive focus-visible:ring-destructive',
					)}
				/>
			</div>
			{error && (
				<p className='flex items-center gap-1 text-[10px] font-bold text-destructive leading-tight'>
					<AlertCircle className='h-3 w-3 shrink-0' />
					{error}
				</p>
			)}
		</div>
	);
}

function TransferLimitInput({
	definition,
	value,
	onChange,
	error,
}: {
	definition: ListingAttributeDefinition;
	value: string;
	onChange: (val: string) => void;
	error?: string;
}) {
	return (
		<div className='space-y-1'>
			<div className='flex items-center justify-between'>
				<Label className='text-xs font-bold'>
					Transfer limiti <span className='text-destructive'>*</span>
				</Label>
				<span className='text-[9px] text-muted-foreground'>oyiga 10 ta</span>
			</div>
			<div className='relative'>
				<Smartphone className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-primary' />
				<Input
					type='number'
					inputMode='numeric'
					min={0}
					max={10}
					placeholder='10'
					value={value}
					onChange={(e) => {
						let v = e.target.value;
						if (v !== '') {
							const n = Number(v);
							if (n > 10) v = '10';
							else if (n < 0) v = '0';
						}
						onChange(v);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') e.currentTarget.blur();
					}}
					className={cn(
						'h-10 rounded-xl pl-8 pr-2 text-base font-bold sm:text-sm',
						error && 'border-destructive focus-visible:ring-destructive',
					)}
				/>
			</div>
			{error && (
				<p className='flex items-center gap-1 text-[10px] font-bold text-destructive leading-tight'>
					<AlertCircle className='h-3 w-3 shrink-0' />
					{error}
				</p>
			)}
		</div>
	);
}

function SteamIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='currentColor'
			className={cn('h-3.5 w-3.5 shrink-0', className)}
		>
			<path d='M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.029 4.524 4.524s-2.03 4.524-4.524 4.524h-.105l-4.076 2.811c0 .052.005.105.005.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 12-5.373 12-12S18.605 0 11.979 0zM7.544 14.805l-.01.004-2.144-.886c.38-.857 1.177-1.488 2.133-1.631l1.528 2.217c-.77.067-1.401.468-1.507.296zm8.4-8.113c1.322 0 2.395 1.073 2.395 2.395 0 1.321-1.073 2.394-2.395 2.394-1.321 0-2.394-1.073-2.394-2.394 0-1.322 1.073-2.395 2.394-2.395zm-9.882 10.93a1.597 1.597 0 1 1 0-3.194 1.597 1.597 0 0 1 0 3.194z' />
		</svg>
	);
}

function PlayStationIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='currentColor'
			className={cn('h-3.5 w-3.5 shrink-0', className)}
		>
			<path d='M8.948 3.52c-.672.48-1.056 1.488-1.056 2.76v9.12c1.224.72 2.376 1.056 3.84 1.056 2.664 0 4.608-1.152 4.608-3.936 0-2.424-1.464-3.552-3.888-4.344l-1.44-.48v-2.76c0-.864.456-1.2 1.152-1.2.696 0 1.296.336 1.848.96l2.16-1.92C15.048 1.6 13.728 1 12.024 1 9.984 1 8.948 2.224 8.948 3.52zm8.712 14.544c-2.472-.888-5.328-1.344-8.496-1.344-3.024 0-5.832.48-8.208 1.368L0 18.528l.96.384c2.256.888 5.16 1.344 8.256 1.344 3.024 0 5.856-.456 8.232-1.344l1.248-.48-.936-.368zm-5.64 1.632c-1.848.6-3.84.936-6.024.936-1.896 0-3.672-.264-5.232-.744l-.768.648C1.848 21.048 3.864 21.36 6 21.36c2.472 0 4.8-.408 6.864-1.152l-1.848-.512zm11.976-.552c-.888-.336-1.992-.624-3.264-.84l-.576.48c1.08.192 2.016.432 2.76.72l1.08-.36zm-3.696 1.392c-1.584.456-3.384.768-5.352.912l.624.528c1.92-.12 3.696-.432 5.232-.888l-.504-.552z' />
		</svg>
	);
}

function GooglePlayIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='currentColor'
			className={cn('h-3.5 w-3.5 shrink-0', className)}
		>
			<path d='M3.609 1.814L13.792 12 3.61 22.186a1.99 1.99 0 0 1-.61-.318V2.132c.193-.116.402-.224.609-.318zm11.309 11.31l2.43 2.43-12.74 7.355 10.31-9.785zM4.608.099l12.74 7.356-2.43 2.43L4.608.099zm14.07 8.125l3.58 2.068a1.986 1.986 0 0 1 0 3.416l-3.58 2.068-2.613-2.613 2.613-2.939z' />
		</svg>
	);
}

function AppleIcon({ className }: { className?: string }) {
	return (
		<svg
			viewBox='0 0 24 24'
			fill='currentColor'
			className={cn('h-3.5 w-3.5 shrink-0', className)}
		>
			<path d='M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.16c.66-.8 1.11-1.92.99-3.04-1 .04-2.19.67-2.9 1.5-.63.73-1.18 1.89-1.03 3 .01 0 .02 0 .03.01 1.11 0 2.25-.67 2.91-1.47z' />
		</svg>
	);
}

function PlatformSelector({
	definition,
	value,
	onChange,
	error,
}: {
	definition: ListingAttributeDefinition;
	value: string;
	onChange: (val: string) => void;
	error?: string;
}) {
	const options = stringListConstraint(definition, 'options');
	const labels = stringMapConstraint(definition, 'option_labels_uz');

	return (
		<div className='space-y-1 pt-0.5'>
			<Label className='text-xs font-bold'>Platforma</Label>
			<div className='grid grid-cols-3 gap-1.5'>
				{options.map((opt) => {
					const selected = (value || 'MOBILE') === opt;
					return (
						<button
							key={opt}
							type='button'
							onClick={() => {
								onChange(opt);
								telegramHaptic(getTelegramWebApp(), 'selection', false);
							}}
							className={cn(
								'tap-press flex items-center justify-center gap-1.5 rounded-xl border py-2 px-2 text-xs font-bold transition select-none',
								selected
									? 'border-primary bg-primary/10 text-primary font-black ring-1 ring-primary/30'
									: 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
							)}
						>
							{opt === 'MOBILE' && <Smartphone className='h-3.5 w-3.5 shrink-0' />}
							{opt === 'STEAM' && <SteamIcon className='h-3.5 w-3.5 shrink-0' />}
							{opt === 'PLAYSTATION' && <PlayStationIcon className='h-3.5 w-3.5 shrink-0' />}
							<span className='truncate'>{labels[opt] ?? opt}</span>
						</button>
					);
				})}
			</div>
			{error && (
				<p className='flex items-center gap-1 text-[11px] font-bold text-destructive'>
					<AlertCircle className='h-3 w-3 shrink-0' />
					{error}
				</p>
			)}
		</div>
	);
}

function CoinInput({
	label,
	value,
	onChange,
	error,
}: {
	label: string;
	value: string;
	onChange: (val: string) => void;
	error?: string;
}) {
	return (
		<div className='space-y-1'>
			<Label className='text-xs font-bold text-muted-foreground'>{label} <span className='text-[9px]'>(ixtiyoriy)</span></Label>
			<div className='relative'>
				<Coins className='absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-amber-500' />
				<Input
					aria-label={label}
					type='number'
					inputMode='numeric'
					placeholder='0'
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') e.currentTarget.blur();
					}}
					className={cn(
						'h-10 rounded-xl pl-8 pr-2 text-base font-bold sm:text-sm',
						error && 'border-destructive focus-visible:ring-destructive',
					)}
				/>
			</div>
			{error && (
				<p className='flex items-center gap-1 text-[10px] font-bold text-destructive leading-tight'>
					<AlertCircle className='h-3 w-3 shrink-0' />
					{error}
				</p>
			)}
		</div>
	);
}

function AttributeInput({
	definition,
	state,
	setState,
	error,
}: {
	definition: ListingAttributeDefinition;
	state: WizardState;
	setState: React.Dispatch<React.SetStateAction<WizardState>>;
	error?: string;
}) {
	const value = state.attributes[definition.key];
	const raw =
		typeof value === 'string' ? value : value === undefined ? '' : String(value);

	function update(next: string) {
		setState((prev) => ({
			...prev,
			attributes: { ...prev.attributes, [definition.key]: next },
		}));
	}

	if (definition.type === 'ENUM') {
		const options = stringListConstraint(definition, 'options');
		const labels = stringMapConstraint(definition, 'option_labels_uz');
		return (
			<div className='space-y-1'>
				<Label className='text-xs font-bold'>{definition.labelUz}</Label>
				<Select
					value={raw}
					onChange={(event) => update(event.target.value)}
					className='h-10 rounded-xl font-semibold text-base sm:text-sm'
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
				{error && (
					<p className='flex items-center gap-1 text-[11px] font-bold text-destructive'>
						<AlertCircle className='h-3 w-3 shrink-0' />
						{error}
					</p>
				)}
			</div>
		);
	}

	if (definition.type === 'INT' || definition.type === 'DECIMAL') {
		const min = numberConstraint(definition, 'min');
		const max = numberConstraint(definition, 'max');
		const allowsNegative = min === undefined || min < 0;

		return (
			<div className='space-y-1'>
				<Label className='text-xs font-bold'>{definition.labelUz}</Label>
				<Input
					type='number'
					inputMode={allowsNegative ? undefined : 'numeric'}
					min={min}
					max={max}
					step={definition.type === 'DECIMAL' ? '0.01' : '1'}
					value={raw}
					onChange={(event) => {
						let nextVal = event.target.value;
						if (nextVal !== '') {
							const num = Number(nextVal);
							if (max !== undefined && num > max) nextVal = String(max);
						}
						update(nextVal);
					}}
					onKeyDown={(e) => {
						if (e.key === 'Enter') e.currentTarget.blur();
					}}
					className={cn(
						'h-10 rounded-xl font-bold text-base sm:text-sm',
						error && 'border-destructive focus-visible:ring-destructive',
					)}
				/>
				{error && (
					<p className='flex items-center gap-1 text-[11px] font-bold text-destructive'>
						<AlertCircle className='h-3 w-3 shrink-0' />
						{error}
					</p>
				)}
			</div>
		);
	}

	return (
		<div className='space-y-1'>
			<Label className='text-xs font-bold'>{definition.labelUz}</Label>
			<Input
				value={raw}
				onChange={(event) => update(event.target.value)}
				onKeyDown={(e) => {
					if (e.key === 'Enter') e.currentTarget.blur();
				}}
				className={cn(
					'h-10 rounded-xl text-base sm:text-sm',
					error && 'border-destructive focus-visible:ring-destructive',
				)}
			/>
			{error && (
				<p className='flex items-center gap-1 text-[11px] font-bold text-destructive'>
					<AlertCircle className='h-3 w-3 shrink-0' />
					{error}
				</p>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// Pricing step

function PricingStep({
	state,
	setState,
	errors,
	commissionConfig,
	advertisingOffer,
}: {
	state: WizardState;
	setState: React.Dispatch<React.SetStateAction<WizardState>>;
	errors: string[];
	commissionConfig?: TradeCommissionConfig | null;
	advertisingOffer?: React.ReactNode;
}) {
	const parsed = Number(state.price);
	const hasValue = Number.isFinite(parsed) && parsed > 0;
	const priceError = errors.find((e) => e.includes('Narx') || e.includes('summasi'));

	function setPriceValue(val: number) {
		const safeVal = Math.min(1000000000, Math.max(0, val));
		setState((prev) => ({ ...prev, price: String(safeVal) }));
		telegramHaptic(getTelegramWebApp(), 'selection', false);
	}

	function addPrice(delta: number) {
		const current = Number(state.price) || 0;
		setPriceValue(current + delta);
	}

	return (
		<div className='space-y-3'>
			{/* Price Input Block */}
			<div className='space-y-2'>
				<div className='flex items-center justify-between'>
					<Label htmlFor='price' className='text-xs font-bold'>
						Narx, so&apos;m <span className='text-destructive'>*</span>
					</Label>
					{hasValue && (
						<span className='text-xs font-black text-[hsl(var(--price))]'>
							{formatPriceUZS(parsed)}
						</span>
					)}
				</div>

				<div className='relative'>
					<Banknote className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
					<Input
						id='price'
						type='number'
						inputMode='numeric'
						min={MIN_LISTING_PRICE_SOM}
						step={1}
						placeholder='5000'
						aria-describedby='listing-price-minimum'
						value={state.price}
						onChange={(event) => {
							let nextVal = event.target.value;
							if (nextVal !== '') {
								const num = Number(nextVal);
								if (num > 1_000_000_000) nextVal = '1000000000';
								else if (num < 0) nextVal = '0';
							}
							setState((prev) => ({ ...prev, price: nextVal }));
						}}
						onKeyDown={(e) => {
							if (e.key === 'Enter') e.currentTarget.blur();
						}}
						className={cn(
							'h-12 rounded-xl pl-9 pr-3 text-lg font-black text-[hsl(var(--price))]',
							priceError && 'border-destructive focus-visible:ring-destructive',
						)}
					/>
				</div>

				<p id='listing-price-minimum' className='text-xs text-muted-foreground'>
					Eng kam narx: 5 000 so‘m.
				</p>
				{priceError && (
					<p className='flex items-center gap-1 text-[11px] font-bold text-destructive'>
						<AlertCircle className='h-3.5 w-3.5 shrink-0' />
						{priceError}
					</p>
				)}

				{/* Quick Price Buttons - Single compact horizontal scroll */}
				<div className='flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5'>
					{[100000, 300000, 500000, 1000000, 2000000].map((val) => (
						<button
							key={val}
							type='button'
							onClick={() => setPriceValue(val)}
							className='tap-press shrink-0 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] font-bold text-primary transition hover:bg-primary/10 active:scale-95'
						>
							{val >= 1000000 ? `${val / 1000000} mln` : `${val / 1000}k`}
						</button>
					))}
					{[50000, 100000, 500000].map((add) => (
						<button
							key={add}
							type='button'
							onClick={() => addPrice(add)}
							className='tap-press shrink-0 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[11px] font-bold text-foreground transition hover:border-primary/50 hover:bg-muted active:scale-95'
						>
							+{add >= 1000000 ? `${add / 1000000} mln` : `${add / 1000}k`}
						</button>
					))}
				</div>

				{/* Live Commission Card */}
				{hasValue && parsed >= MIN_TRADE_PRICE_SOM && (
					<div className='rounded-xl border border-border bg-muted/30 p-2.5 space-y-1.5 text-xs'>
						<div className='flex items-center justify-between text-muted-foreground text-[11px]'>
							<span className='flex items-center gap-1'>
								<ShieldCheck className='h-3 w-3 text-emerald-500' /> Smart xizmat haqi
							</span>
							<span className='font-semibold text-foreground'>
								−{formatPriceUZS(tradeFeeSom(parsed, commissionConfig))}
							</span>
						</div>
						<div className='border-t border-border/60 pt-1.5 flex items-center justify-between'>
							<span className='font-bold text-foreground text-xs'>Sof summa:</span>
							<span className='text-sm font-black text-emerald-600 dark:text-emerald-400'>
								{formatPriceUZS(sellerProceedsSom(parsed, commissionConfig))}
							</span>
						</div>
					</div>
				)}
			</div>

			{/* Price Negotiable Switch */}
			<button
				type='button'
				role='switch'
				aria-checked={state.priceNegotiable}
				onClick={() => {
					setState((prev) => ({
						...prev,
						priceNegotiable: !prev.priceNegotiable,
					}));
					telegramHaptic(getTelegramWebApp(), 'selection', false);
				}}
				className={cn(
					'tap-press flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition select-none',
					state.priceNegotiable
						? 'border-primary/60 bg-primary/5'
						: 'border-border bg-card hover:border-primary/40',
				)}
			>
				<div>
					<p className='text-xs font-bold text-foreground'>Savdolashish mumkin</p>
					<p className='text-[10px] text-muted-foreground'>
						Xaridor narxni muhokama qilish taklifini yuborishi mumkin.
					</p>
				</div>
				<div
					className={cn(
						'relative h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ease-in-out',
						state.priceNegotiable ? 'bg-primary' : 'bg-muted',
					)}
				>
					<span
						className={cn(
							'inline-block h-4 w-4 transform rounded-full bg-white shadow transition duration-200 ease-in-out mt-0.5 ml-0.5',
							state.priceNegotiable ? 'translate-x-4' : 'translate-x-0',
						)}
					/>
				</div>
			</button>

			{advertisingOffer}

			<TipCallout
				variant='security'
				learnMoreHref='/help#transparent-pricing-commission'
				learnMoreLabel='Komissiya va sof summa haqida'
			>
				<strong>Smart savdoda hisob-kitob:</strong> Xaridor to‘lovi savdo yakunlanguncha ushlab turiladi. Savdo muvaffaqiyatli yakunlangach, xizmat haqi chegirilib, <strong>Sof summa</strong> hamyoningizga o‘tkaziladi.
			</TipCallout>
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// Review step

function ReviewStep({
	state,
	photos,
	definitions,
	existingMediaUrls,
	onEditStep,
	commissionConfig,
	accountMode = false,
}: {
	state: WizardState;
	photos: PhotoEntry[];
	definitions: readonly ListingAttributeDefinition[];
	existingMediaUrls: string[];
	onEditStep: (step: StepId) => void;
	commissionConfig?: TradeCommissionConfig | null;
	accountMode?: boolean;
}) {
	const priceNum = Number(state.price);
	const hasPrice = !accountMode && Number.isFinite(priceNum) && priceNum > 0;
	// Akkountda narx yo'q: u bozorga chiqarilganda so'raladi.
	const priceLabel = accountMode
		? 'Bozorda emas'
		: hasPrice
			? formatPriceUZS(priceNum)
			: 'Narx belgilanmagan';
	const usingExisting = photos.length === 0 && existingMediaUrls.length > 0;
	const coverUrl =
		photos[0]?.previewUrl ?? (usingExisting ? existingMediaUrls[0] : null);
	const photoCount = photos.length > 0 ? photos.length : existingMediaUrls.length;
	const valuableCards = playerCards(state.attributes.valuable_players);

	const divLevel = toDivisionLevel(state.attributes.highest_division_level);
	const teamStrength = state.attributes.team_strength;
	const platform = String(state.attributes.platform || 'MOBILE');
	const mobile = isMobileListingPlatform(platform);
	const transferLimit = state.attributes.device_transfer_limit;
	const hasGooglePlay = state.attributes.has_google_play_link;
	const hasGameCenter = state.attributes.has_game_center_link;

	return (
		<div className='space-y-3'>
			{/* Hero Visual Card */}
			<div className='group relative overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-sm'>
				{/* Media Container */}
				<div className='relative aspect-[19.5/9] w-full overflow-hidden bg-black/40'>
					{coverUrl ? (
						<img
							src={coverUrl}
							alt='Akkount muqovasi'
							className='h-full w-full object-cover object-center transition duration-300'
						/>
					) : (
						<div className='grid h-full w-full place-items-center text-muted-foreground'>
							<Camera className='h-8 w-8 stroke-[1.5]' />
						</div>
					)}
					{/* Gradient overlay */}
					<div className='absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent' />

					{/* Top floating badges */}
					<div className='absolute inset-x-2.5 top-2.5 flex items-center justify-between'>
						<div className='flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white backdrop-blur-md'>
							<Camera className='h-3 w-3' />
							<span>{photoCount} ta rasm</span>
						</div>

						{divLevel && (
							<div className='flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-black text-white backdrop-blur-md'>
								<DivisionBadge level={divLevel} size={16} />
								<span>Div {divLevel}</span>
							</div>
						)}
					</div>

					{/* Bottom title & price in photo overlay */}
					<div className='absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2'>
						<div>
							<p className='text-lg sm:text-xl font-black text-white tracking-tight drop-shadow'>
								{priceLabel}
							</p>
							{state.priceNegotiable && (
								<span className='inline-block text-[10px] font-bold text-amber-300 drop-shadow'>
									• Savdolashish mumkin
								</span>
							)}
						</div>
						<button
							type='button'
							onClick={() => onEditStep('pricing')}
							className='flex items-center gap-1 rounded-lg bg-white/20 hover:bg-white/30 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-md transition active:scale-95'
						>
							<Edit3 className='h-3 w-3' />
							<span>O‘zgartirish</span>
						</button>
					</div>
				</div>

				{/* Key Specs Grid */}
				<div className='grid grid-cols-3 divide-x divide-border border-t border-border bg-card text-center text-xs'>
					<div className='py-2 px-1'>
						<p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>
							Jamoa kuchi
						</p>
						<p className='text-xs font-black text-foreground pt-0.5'>
							{teamStrength ? `⚡ ${teamStrength}` : '—'}
						</p>
					</div>

					<div className='py-2 px-1'>
						<p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>
							Platforma
						</p>
						<div className='inline-flex items-center justify-center gap-1 pt-0.5 text-xs font-bold text-foreground'>
							{platform === 'STEAM' ? (
								<>
									<SteamIcon className='h-3 w-3' /> Steam
								</>
							) : platform === 'PLAYSTATION' ? (
								<>
									<PlayStationIcon className='h-3 w-3' /> PS
								</>
							) : (
								<>
									<Smartphone className='h-3 w-3' /> Mobile
								</>
							)}
						</div>
					</div>

					<div className='py-2 px-1'>
						<p className='text-[9px] font-bold uppercase tracking-wider text-muted-foreground'>
							{mobile ? 'Transfer' : 'Coin balansi'}
						</p>
						<p className='text-xs font-black text-foreground pt-0.5'>
							{mobile
								? (transferLimit !== undefined && transferLimit !== '' ? `${transferLimit}/10` : '—')
								: String(state.attributes.coins || '—')}
						</p>
					</div>
				</div>
			</div>

			{/* Description & Store Links */}
			<div className='rounded-xl border border-border bg-card p-3 space-y-2 text-xs'>
				<div className='flex items-center justify-between'>
					<span className='text-[10px] font-bold uppercase tracking-wider text-muted-foreground'>
						{mobile ? 'Tavsif & Ulanishlar' : 'Tavsif'}
					</span>
					<button
						type='button'
						onClick={() => onEditStep('basics')}
						className='flex items-center gap-1 text-[10px] font-bold text-primary hover:underline'
					>
						<Edit3 className='h-3 w-3' /> Tahrirlash
					</button>
				</div>

				<p className='text-xs text-foreground leading-relaxed line-clamp-2'>
					{state.description || (
						<span className='italic text-muted-foreground'>Tavsif kiritilmagan</span>
					)}
				</p>

				{/* Cards snippet */}
				{valuableCards.length > 0 && (
					<div className='flex flex-wrap gap-1 pt-0.5'>
						{valuableCards.slice(0, 5).map((card) => (
							<span
								key={card.efhubId}
								className='inline-flex items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold text-foreground'
							>
								<Star className='h-2.5 w-2.5 fill-amber-400 text-amber-400' />
								{card.name}
							</span>
						))}
						{valuableCards.length > 5 && (
							<span className='text-[10px] font-bold text-muted-foreground self-center'>
								+{valuableCards.length - 5}
							</span>
						)}
					</div>
				)}

				{/* Store Link Badges */}
				{mobile && <div className='flex items-center gap-2 pt-1 border-t border-border/50 text-[11px] font-semibold text-muted-foreground'>
					<span className='inline-flex items-center gap-1'>
						<GooglePlayIcon className={cn('h-3 w-3', hasGooglePlay === true ? 'text-emerald-500' : 'text-muted-foreground/50')} />
						{hasGooglePlay === true ? 'Google Play ulangan' : hasGooglePlay === false ? 'Google Play ulanmagan' : 'Google Play holati noma’lum'}
					</span>
					<span>•</span>
					<span className='inline-flex items-center gap-1'>
						<AppleIcon className={cn('h-3 w-3', hasGameCenter === true ? 'text-foreground' : 'text-muted-foreground/50')} />
						{hasGameCenter === true ? 'Game Center ulangan' : hasGameCenter === false ? 'Game Center ulanmagan' : 'Game Center holati noma’lum'}
					</span>
				</div>}
			</div>

			{/* Smart Transaction Proceeds Notice */}
			{mobile && hasPrice && priceNum >= MIN_TRADE_PRICE_SOM && (
				<div className='flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs'>
					<span className='flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300 text-[11px]'>
						<ShieldCheck className='h-3.5 w-3.5 text-emerald-500' />
						Sotilganda sof tushum:
					</span>
					<span className='font-black text-emerald-700 dark:text-emerald-300 text-xs'>
						{formatPriceUZS(sellerProceedsSom(priceNum, commissionConfig))}
					</span>
				</div>
			)}
		</div>
	);
}

// ─────────────────────────────────────────────────────────────
// Helpers

/** Narrow an unknown wizard-state value to a PlayerCard[] safely. */
function playerCards(value: unknown): PlayerCard[] {
	if (!Array.isArray(value)) return [];
	return value.filter(
		(item): item is PlayerCard =>
			!!item &&
			typeof item === 'object' &&
			typeof (item as PlayerCard).efhubId === 'number' &&
			typeof (item as PlayerCard).name === 'string',
	);
}

function renderAttributeValue(
	value: unknown,
	def?: ListingAttributeDefinition,
) {
	if (value === undefined || value === '')
		return <span className='text-muted-foreground'>—</span>;
	if (typeof value === 'boolean') return value ? 'Ha' : "Yo'q";
	if (Array.isArray(value)) {
		const cards = playerCards(value);
		if (cards.length === 0)
			return <span className='text-muted-foreground'>—</span>;
		return cards
			.map(
				(c) =>
					`${c.name}${cardRating(c) ? ` ${cardRating(c)}` : ''}${c.cardType ? ` ${c.cardType}` : ''}`,
			)
			.join(', ');
	}
	if (typeof value === 'string' && def?.type === 'ENUM') {
		const labels = stringMapConstraint(def, 'option_labels_uz');
		return labels[value] ?? value;
	}
	return String(value);
}

function defaultAttributeValue(
	def: ListingAttributeDefinition,
): AttributeValue {
	if (def.type === 'BOOLEAN') return '';
	if (def.type === 'CARD_LIST') return [];
	if (def.type === 'ENUM') {
		const preset = def.constraints?.default;
		if (typeof preset === 'string') return preset;
	}
	return '';
}

function initialAttributes(definitions: readonly ListingAttributeDefinition[]) {
	const attributes: AttributeMap = {};
	for (const def of definitions) {
		attributes[def.key] = defaultAttributeValue(def);
	}
	return attributes;
}

function mergeAttributes(
	current: AttributeMap,
	definitions: readonly ListingAttributeDefinition[],
) {
	const next: AttributeMap = {};
	for (const def of definitions) {
		if (def.key in current) next[def.key] = current[def.key];
		else next[def.key] = defaultAttributeValue(def);
	}
	return next;
}

/**
 * Turn a persisted listing.attributes payload into the wizard's edit-state shape.
 */
function attributesFromListing(
	raw: Record<string, unknown>,
	definitions: readonly ListingAttributeDefinition[],
): AttributeMap {
	const out: AttributeMap = {};
	for (const def of definitions) {
		const value = raw?.[def.key];
		if (def.type === 'BOOLEAN') {
			out[def.key] = typeof value === 'boolean' ? value : value === 'true' ? true : value === 'false' ? false : '';
			continue;
		}
		if (value === undefined || value === null) {
			out[def.key] = defaultAttributeValue(def);
			continue;
		}
		if (def.type === 'CARD_LIST') {
			out[def.key] = normalizeCardListPayload(value);
			continue;
		}
		if (def.type === 'LIST_STRING') {
			if (Array.isArray(value)) {
				out[def.key] = value
					.filter((entry) => typeof entry === 'string')
					.join(', ');
			} else if (typeof value === 'string') {
				out[def.key] = value;
			} else {
				out[def.key] = '';
			}
			continue;
		}
		out[def.key] = typeof value === 'string' ? value : String(value);
	}
	return out;
}

function normalizeCardListPayload(value: unknown): PlayerCard[] {
	if (!Array.isArray(value)) return [];
	const out: PlayerCard[] = [];
	for (const raw of value) {
		if (!raw || typeof raw !== 'object') continue;
		const item = raw as Record<string, unknown>;
		const efhubId = item.efhubId ?? item.efhub_id;
		const playerId = item.playerId ?? item.player_id;
		const metaTierRaw = item.metaTier ?? item.meta_tier;
		const name = item.name;
		if (typeof efhubId !== 'number' || typeof playerId !== 'string' || typeof name !== 'string') continue;
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
		});
	}
	return out;
}

function cardToApiPayload(card: PlayerCard): Record<string, unknown> {
	const payload: Record<string, unknown> = {
		efhub_id: card.efhubId,
		player_id: card.playerId,
		name: card.name,
	};
	if (card.team !== undefined) payload.team = card.team;
	if (card.position !== undefined) payload.position = card.position;
	if (card.playingStyle !== undefined) payload.playing_style = card.playingStyle;
	if (card.overallRating !== undefined)
		payload.overall_rating = card.overallRating;
	if (card.maxOverallRating !== undefined)
		payload.max_overall_rating = card.maxOverallRating;
	if (card.cardType !== undefined) payload.card_type = card.cardType;
	if (card.metaTier !== undefined) payload.meta_tier = card.metaTier;
	if (card.imageUrl !== undefined) payload.image_url = card.imageUrl;
	if (card.skills !== undefined) payload.skills = card.skills;
	return payload;
}

function validateStep(
	step: StepId,
	state: WizardState,
	photos: PhotoEntry[],
	definitions: readonly ListingAttributeDefinition[],
	keepExistingMedia = false,
): string[] {
	const errors: string[] = [];

	if (step === 'photos') {
		if (photos.length === 0 && !keepExistingMedia) {
			errors.push(`Kamida ${MIN_FILES} ta rasm yuklang.`);
		}
		if (photos.length > 0 && photos.length < MIN_FILES) {
			errors.push(`Kamida ${MIN_FILES} ta rasm yuklang.`);
		}
		if (photos.length > MAX_FILES)
			errors.push(`Ko'pi bilan ${MAX_FILES} ta rasm.`);
	}

	if (step === 'basics') {
		if (state.description.trim().length < 10) {
			errors.push("Tavsif kamida 10 belgidan iborat bo'lsin.");
		}
	}

	if (step === 'gameplay') {
		for (const def of definitions) {
			if (def.active === false || !isListingAttributeApplicable(def.key, state.attributes.platform)) continue;
			if (def.key === 'valuable_players') continue;
			const value = state.attributes[def.key];
			if (def.type === 'BOOLEAN') {
				if ((def.required || SERVICE_LINK_KEYS.includes(def.key)) && typeof value !== 'boolean') {
					errors.push(`${def.labelUz} holatini tanlang.`);
				}
				continue;
			}
			const raw = typeof value === 'string' ? value.trim() : '';
			const isCoin = def.key === 'android_coins' || def.key === 'ios_coins';
			const isRequired = def.required && !isCoin;
			if (isRequired && !raw) {
				errors.push(`${def.labelUz} maydonini to'ldiring.`);
				continue;
			}
			if (!raw) continue;
			if (def.type === 'INT') {
				const num = Number(raw);
				if (!Number.isInteger(num))
					errors.push(`${def.labelUz} butun son bo'lishi kerak.`);
				else {
					const min = numberConstraint(def, 'min');
					const max = numberConstraint(def, 'max');
					const minSellable = numberConstraint(def, 'min_sellable');
					if (min !== undefined && num < min)
						errors.push(`${def.labelUz} ${min} dan kichik bo'lmasin.`);
					if (max !== undefined && num > max)
						errors.push(`${def.labelUz} ${max} dan katta bo'lmasin.`);
					if (minSellable !== undefined && num >= (min ?? num) && num < minSellable)
						errors.push(
							def.key === 'device_transfer_limit'
								? `Qurilma almashtirish limiti ${num} ta qolgan. Sotuv uchun kamida ${minSellable} ta kerak.`
								: `${def.labelUz} sotuvga qo'yish uchun kamida ${minSellable} bo'lsin.`,
						);
				}
			}
			if (def.type === 'DECIMAL') {
				const num = Number(raw);
				if (!Number.isFinite(num))
					errors.push(`${def.labelUz} son bo'lishi kerak.`);
			}
		}
	}

	if (step === 'pricing') {
		const price = Number(state.price);
		if (!Number.isFinite(price) || price < MIN_LISTING_PRICE_SOM)
			errors.push("Narx kamida 5 000 so'm bo'lishi kerak.");
		if (price > 1_000_000_000) errors.push('Narx juda katta.');
	}

	return errors;
}

function buildRequest(
	state: WizardState,
	definitions: readonly ListingAttributeDefinition[],
): ListingCreateRequest {
	const attributes: Record<string, unknown> = {};
	for (const def of definitions) {
		if (def.active === false || !isListingAttributeApplicable(def.key, state.attributes.platform)) continue;
		const raw = state.attributes[def.key];
		if (def.type === 'BOOLEAN') {
			if (typeof raw === 'boolean') attributes[def.key] = raw;
			continue;
		}
		if (def.type === 'CARD_LIST') {
			const cards = playerCards(raw);
			if (cards.length > 0) attributes[def.key] = cards.map(cardToApiPayload);
			continue;
		}
		if (typeof raw !== 'string' || !raw.trim()) {
			if (def.key === 'android_coins' || def.key === 'ios_coins') {
				attributes[def.key] = 0;
			}
			continue;
		}
		switch (def.type) {
			case 'INT': {
				const num = Number(raw);
				if (Number.isInteger(num)) attributes[def.key] = num;
				else if (def.key === 'android_coins' || def.key === 'ios_coins') {
					attributes[def.key] = 0;
				}
				break;
			}
			case 'DECIMAL': {
				const num = Number(raw);
				if (Number.isFinite(num)) attributes[def.key] = num;
				break;
			}
			case 'LIST_STRING': {
				const list = normalizePlayerList(raw);
				if (list.length > 0) attributes[def.key] = list;
				break;
			}
			default:
				attributes[def.key] = raw.trim();
		}
	}

	if (isMobileListingPlatform(state.attributes.platform)) {
		if (attributes.android_coins === undefined) attributes.android_coins = 0;
		if (attributes.ios_coins === undefined) attributes.ios_coins = 0;
	}

	return {
		description: state.description.trim(),
		price: Number(state.price),
		priceNegotiable: state.priceNegotiable,
		attributes,
	};
}

function numberConstraint(definition: ListingAttributeDefinition, key: string) {
	const raw = definition.constraints?.[key];
	const value =
		typeof raw === 'number' || typeof raw === 'string'
			? Number(raw)
			: Number.NaN;
	return Number.isFinite(value) ? value : undefined;
}

function stringListConstraint(
	definition: ListingAttributeDefinition,
	key: string,
) {
	const raw = definition.constraints?.[key];
	return Array.isArray(raw)
		? raw.filter((item): item is string => typeof item === 'string')
		: [];
}

function stringMapConstraint(
	definition: ListingAttributeDefinition,
	key: string,
): Record<string, string> {
	const raw = definition.constraints?.[key];
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const out: Record<string, string> = {};
	for (const [k, v] of Object.entries(raw)) {
		if (typeof v === 'string') out[k] = v;
	}
	return out;
}

function isRecord(payload: unknown): payload is Record<string, unknown> {
	return typeof payload === 'object' && payload !== null;
}

function normalizeAttributeDefinitions(
	payload: unknown,
): ListingAttributeDefinition[] {
	if (!Array.isArray(payload)) return [];
	return payload
		.filter(
			(entry): entry is ListingAttributeDefinition =>
				isRecord(entry) &&
				typeof entry.key === 'string' &&
				typeof entry.labelUz === 'string' &&
				typeof entry.required === 'boolean' &&
				isAttributeType(entry.type),
		)
		.map((def) =>
			def.key === 'android_coins' || def.key === 'ios_coins'
				? { ...def, required: false }
				: def,
		)
		.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
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
	);
}

async function safeJson(response: Response) {
	const text = await response.text();
	if (!text) return null;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return null;
	}
}

function errorFromPayload(payload: unknown, fallback: string) {
	if (!isRecord(payload)) return fallback;
	if (typeof payload.message === 'string') return payload.message;
	if (typeof payload.error === 'string') return payload.error;
	return fallback;
}

/**
 * Read a persisted draft. Returns null on server, unavailable storage, missing
 * key, or malformed JSON — callers should treat null as "no draft to restore".
 */
function draftKey(accountMode: boolean) {
	return accountMode ? ACCOUNT_DRAFT_KEY : DRAFT_KEY;
}

function readDraft(accountMode = false): { step?: StepId; state?: Partial<WizardState> } | null {
	if (typeof window === 'undefined') return null;
	try {
		const current = window.localStorage.getItem(draftKey(accountMode));
		// Eski kalit faqat e'lon qoralamasida bor edi — akkount oqimida izlamaymiz.
		const raw = current ?? (accountMode ? null : window.localStorage.getItem(LEGACY_DRAFT_KEY));
		if (!raw) return null;
		const parsed = JSON.parse(raw) as unknown;
		if (!isRecord(parsed)) return null;
		const draft = parsed as { step?: StepId; state?: Partial<WizardState> };
		// Old unchecked switches were saved as false even without an answer.
		if (!current && draft.state?.attributes) {
			for (const key of SERVICE_LINK_KEYS) {
				if (draft.state.attributes[key] === false) draft.state.attributes[key] = '';
			}
		}
		return draft;
	} catch {
		return null;
	}
}

function writeDraft(step: StepId, state: WizardState, accountMode = false) {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.setItem(draftKey(accountMode), JSON.stringify({ step, state }));
	} catch {
		// storage full / private mode / SecurityError — dropping the draft is fine
	}
}

function clearDraft(accountMode = false) {
	if (typeof window === 'undefined') return;
	try {
		window.localStorage.removeItem(draftKey(accountMode));
		if (!accountMode) window.localStorage.removeItem(LEGACY_DRAFT_KEY);
	} catch {
		// ignore
	}
}
