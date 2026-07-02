interface BrandMarkProps {
  className?: string;
}

/**
 * Single glyph: a circular bowl + crossbar ending in a ball — reads as a
 * geometric "e" (efBazaar) with a football kicked off the tail. Kept to
 * three thick strokes on purpose so it stays legible at favicon sizes.
 */
export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden>
      <circle cx="46" cy="52" r="24" stroke="currentColor" strokeWidth="14" />
      <line x1="24" y1="52" x2="76" y2="52" stroke="currentColor" strokeWidth="14" strokeLinecap="round" />
      <circle cx="85" cy="52" r="9" fill="currentColor" />
    </svg>
  );
}
