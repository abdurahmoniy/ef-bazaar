import { cn } from '@/lib/utils'

/**
 * eFootball League badge — renders the official artwork stored under
 * {@code /public/badges/division-{1..4}.png}. There are exactly 4 badges:
 * D1, D2, D3, and D4 which covers "division 4 or higher". Any legacy listing
 * with a division number above 4 is clamped to badge 4 for display.
 */
export type DivisionLevel = 1 | 2 | 3 | 4

interface DivisionBadgeProps {
	level: DivisionLevel
	/** Rendered pixel size (both width and height — badges are square). */
	size?: number
	className?: string
	/** Adds a soft drop shadow. Off by default for compact list contexts. */
	glow?: boolean
}

const LABELS: Record<DivisionLevel, string> = {
	1: 'Division 1',
	2: 'Division 2',
	3: 'Division 3',
	4: 'Division 4+',
}

export function DivisionBadge({
	level,
	size = 40,
	className,
	glow = false,
}: DivisionBadgeProps) {
	return (
		<img
			src={`/badges/division-${level}.png`}
			alt={LABELS[level]}
			width={size}
			height={size}
			loading='lazy'
			decoding='async'
			className={cn(
				'inline-block object-contain',
				glow && 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]',
				className,
			)}
		/>
	)
}

/**
 * Coerce an arbitrary attribute value into a DivisionLevel or return null.
 * Legacy listings may hold divisions 5–9 (before the 4-bucket model shipped);
 * those collapse into badge 4 so they still get a badge instead of a fallback.
 */
export function toDivisionLevel(value: unknown): DivisionLevel | null {
	const num =
		typeof value === 'number'
			? value
			: typeof value === 'string'
				? Number(value)
				: NaN
	if (!Number.isFinite(num) || num < 1) return null
	if (num >= 4) return 4
	return num === 1 || num === 2 || num === 3 ? (num as DivisionLevel) : null
}
