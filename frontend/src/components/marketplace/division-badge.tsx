import { cn } from '@/lib/utils';

/**
 * eFootball-League-style shield badge for the top-3 division tiers. Rendered
 * inline SVG so it scales cleanly at any size, supports any DOM className, and
 * doesn't require shipping raster assets. Drop-in replacement: swap the SVG
 * body for an <img src="/badges/division-N.svg" /> if official artwork is
 * added later.
 */
export type DivisionLevel = 1 | 2 | 3;

interface DivisionBadgeProps {
  level: DivisionLevel;
  /** Rendered pixel size (width). Height is proportional. */
  size?: number;
  className?: string;
  /** Adds a soft drop shadow. Off by default for compact list contexts. */
  glow?: boolean;
}

interface Palette {
  top: string;
  bottom: string;
  accent: string;
  chevron: string;
}

const PALETTES: Record<DivisionLevel, Palette> = {
  // D1 — top tier: crimson → deep blue, gold accent.
  1: { top: '#e11d48', bottom: '#1e40af', accent: '#fbbf24', chevron: '#fca5a5' },
  // D2 — mid tier: amber → violet.
  2: { top: '#f59e0b', bottom: '#7c3aed', accent: '#fde68a', chevron: '#fcd34d' },
  // D3 — entry tier: teal → emerald.
  3: { top: '#14b8a6', bottom: '#059669', accent: '#a7f3d0', chevron: '#5eead4' },
};

export function DivisionBadge({ level, size = 40, className, glow = false }: DivisionBadgeProps) {
  const palette = PALETTES[level];
  const gradientId = `div-badge-${level}`;
  const clipId = `div-badge-clip-${level}`;

  return (
    <svg
      viewBox="0 0 100 120"
      width={size}
      height={(size * 120) / 100}
      className={cn(glow && 'drop-shadow-[0_2px_6px_rgba(0,0,0,0.25)]', className)}
      aria-label={`Divisiya ${level}`}
      role="img"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.top} />
          <stop offset="100%" stopColor={palette.bottom} />
        </linearGradient>
        <clipPath id={clipId}>
          <path d="M50 3 L96 16 L96 66 Q96 100 50 117 Q4 100 4 66 L4 16 Z" />
        </clipPath>
      </defs>
      {/* shield body */}
      <path
        d="M50 3 L96 16 L96 66 Q96 100 50 117 Q4 100 4 66 L4 16 Z"
        fill={`url(#${gradientId})`}
        stroke="white"
        strokeWidth="2"
      />
      {/* Diagonal stripe texture — echoes the lightning-bolt motif on the
          reference eFootball League badges without the visual noise of a
          detailed illustration. Stroke-based so it stays crisp at any size. */}
      <g clipPath={`url(#${clipId})`} opacity="0.28" stroke={palette.chevron} strokeWidth="6" fill="none">
        <path d="M-20 20 L120 -20" />
        <path d="M-20 50 L120 10" />
        <path d="M-20 80 L120 40" />
        <path d="M-20 110 L120 70" />
        <path d="M-20 140 L120 100" />
      </g>
      {/* division number */}
      <text
        x="50"
        y="70"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontWeight="900"
        fontSize="58"
        fill="white"
        stroke={palette.accent}
        strokeWidth="1.2"
        paintOrder="stroke"
      >
        {level}
      </text>
      {/* footer band */}
      <rect x="4" y="92" width="92" height="14" fill="rgba(0,0,0,0.35)" clipPath={`url(#${clipId})`} />
      <text
        x="50"
        y="102"
        textAnchor="middle"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontWeight="700"
        fontSize="7"
        letterSpacing="1"
        fill="white"
      >
        EFOOTBALL LEAGUE
      </text>
    </svg>
  );
}

/** Parse arbitrary attribute value into a DivisionLevel or return null. */
export function toDivisionLevel(value: unknown): DivisionLevel | null {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return num === 1 || num === 2 || num === 3 ? (num as DivisionLevel) : null;
}
