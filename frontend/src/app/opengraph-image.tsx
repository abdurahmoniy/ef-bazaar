import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ImageResponse } from 'next/og';

import { BrandMarkOG } from '@/components/brand/brand-mark-og';
import { siteConfig } from '@/lib/site';

export const alt = 'eFBazaar — eFootball akkount bozori: akkount emas, yulduz qidiring';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

// Light-theme roles from globals.css. Satori cannot read CSS variables, so
// the share card pins the same values the homepage resolves at runtime.
const PAPER = '#ffffff'; // --background
const INK = '#0a0a29'; // --foreground
const BLUE = '#000099'; // --primary
const LOGO_GOLD = '#ffd633'; // --primary-foreground
const GOLD = '#f9bf10'; // --secondary
const GOLD_INK = '#0f0f3d'; // --secondary-foreground
const MUTED = '#55556d'; // --muted-foreground
const RULE = '#dcdce5'; // --border

const DISPLAY = 'Landing Display';
const POSTER_WIDTH = 640;
const CARD_TIERS = ['Epic', 'Big Time', 'Show Time'];

// Static files baked for this card: weight instances of the landing display
// face (Satori reads neither WOFF2 nor variable fonts) and the hero poster
// with its duotone treatment (scripts/build-og-poster.mjs).
const ASSETS = path.join(process.cwd(), 'src/assets/og');

function asset(name: string) {
  return readFile(path.join(ASSETS, name));
}

function ShieldCheck({ size: px, color }: { size: number; color: string }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default async function OpenGraphImage() {
  const [display, label, poster] = await Promise.all([
    asset('big-shoulders-display-800.ttf'),
    asset('big-shoulders-display-600.ttf'),
    asset('poster.jpg'),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          position: 'relative',
          background: PAPER,
          color: INK,
          fontFamily: DISPLAY,
        }}
      >
        <img
          src={`data:image/jpeg;base64,${poster.toString('base64')}`}
          width={POSTER_WIDTH}
          height={size.height}
          alt=""
          style={{ position: 'absolute', top: 0, right: 0 }}
        />

        <div
          style={{
            position: 'absolute',
            right: 54,
            bottom: 52,
            width: 168,
            height: 168,
            borderRadius: 84,
            background: GOLD,
            color: GOLD_INK,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            transform: 'rotate(-12deg)',
          }}
        >
          <ShieldCheck size={30} color={GOLD_INK} />
          <div style={{ marginTop: 6, fontSize: 50, lineHeight: 0.9, fontWeight: 800, textTransform: 'uppercase' }}>
            Garov
          </div>
          <div style={{ marginTop: 6, fontSize: 17, fontWeight: 600, letterSpacing: 3, textTransform: 'uppercase' }}>
            himoyasi
          </div>
        </div>

        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            width: 760,
            height: '100%',
            padding: '52px 0 50px 64px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <BrandMarkOG size={60} glyph={LOGO_GOLD} background={BLUE} />
            <div style={{ display: 'flex', fontSize: 46, fontWeight: 800, letterSpacing: 0.5 }}>
              <span>eF</span>
              <span style={{ color: BLUE }}>Bazaar</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                color: MUTED,
                fontSize: 23,
                fontWeight: 600,
                letterSpacing: 3.2,
                textTransform: 'uppercase',
              }}
            >
              <div style={{ width: 40, height: 4, background: GOLD }} />
              O‘zbekiston · eFootball akkount bozori
            </div>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                marginTop: 18,
                fontSize: 108,
                lineHeight: 0.95,
                fontWeight: 800,
                letterSpacing: -1.6,
                textTransform: 'uppercase',
                whiteSpace: 'nowrap',
              }}
            >
              <span>Akkount emas —</span>
              <span style={{ display: 'flex' }}>
                <span style={{ color: BLUE }}>yulduz</span>
                <span style={{ marginLeft: 24 }}>qidiring.</span>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                height: 58,
                padding: '0 28px',
                borderRadius: 29,
                background: BLUE,
                color: LOGO_GOLD,
                fontSize: 30,
                fontWeight: 800,
                letterSpacing: 1.2,
              }}
            >
              {new URL(siteConfig.url).host}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 27, fontWeight: 600, letterSpacing: 2.4, textTransform: 'uppercase' }}>
              {CARD_TIERS.map((tier, index) => (
                <div key={tier} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  {index > 0 ? <div style={{ width: 1, height: 24, background: RULE }} /> : null}
                  {tier}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: DISPLAY, data: display, weight: 800, style: 'normal' },
        { name: DISPLAY, data: label, weight: 600, style: 'normal' },
      ],
    },
  );
}
