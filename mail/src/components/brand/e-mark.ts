/**
 * eFBazaar "e" brand mark geometry — copied verbatim from
 * frontend/src/components/brand/e-mark.ts (the og/favicon helpers the
 * marketplace also exports are omitted; the mail app only draws the glyph).
 *
 * All coordinates live in a 100×100 viewBox. The arcs are cut out of the
 * disc with a luminance mask (hole plus the full middle band); the
 * crossbar is then drawn back as its own solid path so its edges stay
 * crisp at every raster size.
 */

export const E_MARK_VIEWBOX = 100;

export const E_MARK = {
  disc: { cx: 50, cy: 50, r: 38 },
  /** inner counter — pokes into the top and bottom arcs as a hump */
  hole: { cx: 50, cy: 50, r: 23.5 },
  /** middle band cleared from the disc: both gaps plus the bar zone */
  band: { y: 34.8, height: 30.4 },
  /** crossbar: flat left end, right end rounded along the disc edge */
  barPath: 'M14.4 42.4 L87.2 42.4 A38 38 0 0 1 87.2 57.6 L14.4 57.6 Z',
} as const;
