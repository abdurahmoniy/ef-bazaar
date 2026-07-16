import { useId } from 'react';

import { E_MARK, E_MARK_VIEWBOX } from '@/components/brand/e-mark';

interface BrandMarkProps {
  className?: string;
}

/**
 * eFBazaar "e" glyph: the sliced-disc "e" — top arc, crossbar (flat left
 * end, disc-rounded right end), bottom arc. Drawn in currentColor; the
 * arcs are punched out of the disc with a luminance mask so the
 * background shows through on any surface.
 */
export function BrandMark({ className }: BrandMarkProps) {
  const maskId = useId();
  const { disc, hole, band, barPath } = E_MARK;

  return (
    <svg viewBox={`0 0 ${E_MARK_VIEWBOX} ${E_MARK_VIEWBOX}`} fill="none" className={className} aria-hidden>
      <mask id={maskId}>
        <rect width={E_MARK_VIEWBOX} height={E_MARK_VIEWBOX} fill="#fff" />
        <circle cx={hole.cx} cy={hole.cy} r={hole.r} fill="#000" />
        <rect x="0" y={band.y} width={E_MARK_VIEWBOX} height={band.height} fill="#000" />
      </mask>
      <circle cx={disc.cx} cy={disc.cy} r={disc.r} fill="currentColor" mask={`url(#${maskId})`} />
      <path d={barPath} fill="currentColor" />
    </svg>
  );
}
