import { BRAND_TEAL, eMarkSvg } from '@/components/brand/e-mark';

interface BrandMarkOGProps {
  size: number;
  radius?: number;
}

function toBase64(value: string) {
  // edge runtime has btoa; the node runtime has Buffer
  return typeof btoa === 'function' ? btoa(value) : Buffer.from(value).toString('base64');
}

/**
 * Same "e" glyph as BrandMark, on a teal chip, for next/og renders
 * (favicon, apple icon, OG cards). Satori's inline-SVG support is
 * unreliable, but it rasterizes <img> data URIs faithfully — so the shared
 * SVG source is embedded that way and stays pixel-identical to the header
 * logo at every size.
 */
export function BrandMarkOG({ size, radius }: BrandMarkOGProps) {
  const radiusRatio = ((radius ?? size * 0.28) / size) * 100;
  const svg = eMarkSvg({ glyph: '#ffffff', background: BRAND_TEAL, radius: radiusRatio });

  return (
    <img
      src={`data:image/svg+xml;base64,${toBase64(svg)}`}
      width={size}
      height={size}
      alt=""
    />
  );
}
