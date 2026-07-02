import { ImageResponse } from 'next/og';

import { BrandMarkOG } from '@/components/brand/brand-mark-og';
import { siteConfig } from '@/lib/site';

export const runtime = 'edge';
export const alt = 'efBazaar — eFootball akkount bozori';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

const PRIMARY = '#1f7a4d';
const INK = '#1c1917';
const MUTED = '#6b7280';
const BORDER = '#e5e7eb';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#fafaf7',
          color: INK,
          fontFamily: 'Inter, Arial, sans-serif',
          padding: 56,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'relative',
            display: 'flex',
            width: '100%',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 54,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', width: 650 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                fontSize: 24,
                color: PRIMARY,
                marginBottom: 34,
                fontWeight: 800,
              }}
            >
              <BrandMarkOG size={44} radius={12} />
              Telegram orqali ishlaydigan bozor
            </div>

            <div style={{ fontSize: 96, lineHeight: 0.95, fontWeight: 900, letterSpacing: 0 }}>
              {siteConfig.name}
            </div>
            <div
              style={{
                marginTop: 24,
                fontSize: 36,
                lineHeight: 1.2,
                color: '#44403c',
                maxWidth: 620,
              }}
            >
              eFootball akkountlarini xavfsiz sotish va sotib olish.
            </div>

            <div style={{ display: 'flex', gap: 14, marginTop: 40, fontSize: 22 }}>
              {['Diviziyon', 'Jamoa kuchi', 'Tanga', "O'yinchilar"].map((item) => (
                <div
                  key={item}
                  style={{
                    border: `1px solid ${BORDER}`,
                    background: '#ffffff',
                    color: '#44403c',
                    padding: '10px 16px',
                    borderRadius: 999,
                    fontWeight: 700,
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          </div>

          <div
            style={{
              width: 360,
              border: `1px solid ${BORDER}`,
              background: '#ffffff',
              borderRadius: 20,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              boxShadow: '0 28px 60px rgba(28,25,23,0.12)',
            }}
          >
            <div style={{ fontSize: 20, color: MUTED, fontWeight: 700 }}>Namuna e&apos;lon</div>
            <div style={{ fontSize: 30, fontWeight: 800 }}>Diviziyon 1 akkount</div>
            <div
              style={{
                height: 150,
                borderRadius: 16,
                background: PRIMARY,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 54,
                fontWeight: 900,
                color: '#ffffff',
              }}
            >
              3150
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 22, fontWeight: 700 }}>
              <span style={{ color: PRIMARY }}>Google ulangan</span>
              <span>450 000 so&apos;m</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                background: PRIMARY,
                color: '#ffffff',
                borderRadius: 12,
                padding: '14px 18px',
                fontSize: 22,
                fontWeight: 800,
              }}
            >
              Telegram orqali kirish
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
