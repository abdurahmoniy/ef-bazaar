/**
 * eFBazaar "e" brand mark — a sliced-disc "e" in the spirit of the
 * eFootball icon: a disc carved by two horizontal gaps into a top arc, a
 * crossbar, and a bottom arc. The crossbar has a flat vertical left end
 * and a rounded right end that follows the disc edge. Single source of
 * truth for both the in-app SVG (BrandMark) and the next/og raster
 * renders (BrandMarkOG).
 *
 * All coordinates live in a 100×100 viewBox. The arcs are cut out of the
 * disc with a luminance mask (hole plus the full middle band); the
 * crossbar is then drawn back as its own solid path so its edges stay
 * crisp at every raster size.
 */

export const BRAND_TEAL = '#1d8b80';
export const E_MARK_VIEWBOX = 100;

export const E_MARK = {
  disc: { cx: 50, cy: 50, r: 38 },
  /** inner counter — pokes into the top and bottom arcs as a hump */
  hole: { cx: 50, cy: 50, r: 23.5 },
  /** middle band cleared from the disc: both gaps plus the bar zone */
  band: { y: 34.8, height: 30.4 },
  /** Flat left end meets the disc's x=12 edge; the right end follows its curve. */
  barPath: 'M12 42.4 L87.2 42.4 A38 38 0 0 1 87.2 57.6 L12 57.6 Z',
} as const;

export interface EMarkSvgOptions {
  /** glyph colour */
  glyph?: string;
  /** chip background */
  background?: string;
  /** chip corner radius in viewBox units (0–50) */
  radius?: number;
  /** glyph scale inside the chip, for app-icon breathing room */
  inset?: number;
}

/**
 * Standalone SVG document of the mark on a rounded chip. Used for the
 * static favicon and (as a data URI) for next/og renders, where Satori
 * handles a plain <img> far more reliably than inline SVG markup.
 */
export function eMarkSvg({
  glyph = '#ffffff',
  background = BRAND_TEAL,
  radius = 28,
  inset = 0.78,
}: EMarkSvgOptions = {}): string {
  const { disc, hole, band, barPath } = E_MARK;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${E_MARK_VIEWBOX} ${E_MARK_VIEWBOX}">` +
    `<rect width="${E_MARK_VIEWBOX}" height="${E_MARK_VIEWBOX}" rx="${radius}" fill="${background}"/>` +
    `<mask id="e">` +
    `<rect width="${E_MARK_VIEWBOX}" height="${E_MARK_VIEWBOX}" fill="#fff"/>` +
    `<circle cx="${hole.cx}" cy="${hole.cy}" r="${hole.r}" fill="#000"/>` +
    `<rect x="0" y="${band.y}" width="${E_MARK_VIEWBOX}" height="${band.height}" fill="#000"/>` +
    `</mask>` +
    `<g transform="translate(50 50) scale(${inset}) translate(-50 -50)">` +
    `<circle cx="${disc.cx}" cy="${disc.cy}" r="${disc.r}" fill="${glyph}" mask="url(#e)"/>` +
    `<path d="${barPath}" fill="${glyph}"/>` +
    `</g>` +
    `</svg>`
  );
}
