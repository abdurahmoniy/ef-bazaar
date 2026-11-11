// Bakes the landing hero poster treatment (gold duotone, print dots, edge
// fades) into a flat JPEG for the share card. next/og (Satori) cannot apply
// CSS blend modes, filters or masks, so the look defined in
// landing-v2.module.css (.poster/.posterColor/.posterImage/.halftone) is
// reproduced here once. Re-run after replacing legends.png:
//   node scripts/build-og-poster.mjs
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'public/landing-v2/legends.png');
const target = path.join(root, 'src/assets/og/poster.jpg');

const WIDTH = 640;
const HEIGHT = 630;
const GOLD = '#f9bf10'; // --secondary
const DOT = '#0f0f3d'; // --secondary-foreground
const PAPER = '#ffffff'; // --background

const gray = await sharp(source)
  .resize({ width: WIDTH })
  .extract({ left: 0, top: 18, width: WIDTH, height: HEIGHT })
  .grayscale()
  .linear(1.12, -0.12 * 128)
  .toColourspace('srgb')
  .toBuffer();

const overlay = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <defs>
      <pattern id="dots" width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2.5" cy="2.5" r="1" fill="${DOT}" fill-opacity=".3"/>
      </pattern>
      <linearGradient id="left" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0" stop-color="${PAPER}" stop-opacity="1"/>
        <stop offset=".34" stop-color="${PAPER}" stop-opacity="0"/>
      </linearGradient>
      <linearGradient id="bottom" x1="0" x2="0" y1="0" y2="1">
        <stop offset=".7" stop-color="${PAPER}" stop-opacity="0"/>
        <stop offset="1" stop-color="${PAPER}" stop-opacity=".85"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#dots)"/>
    <rect width="100%" height="100%" fill="${PAPER}" fill-opacity=".22"/>
    <rect width="100%" height="100%" fill="url(#bottom)"/>
    <rect width="100%" height="100%" fill="url(#left)"/>
  </svg>`,
);

await sharp({ create: { width: WIDTH, height: HEIGHT, channels: 3, background: GOLD } })
  .composite([
    { input: gray, blend: 'multiply' },
    { input: overlay, blend: 'over' },
  ])
  .jpeg({ quality: 84, mozjpeg: true })
  .toFile(target);

console.log(`wrote ${path.relative(root, target)}`);
