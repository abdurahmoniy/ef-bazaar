import { ImageResponse } from 'next/og';

import { siteConfig } from '@/lib/site';

export const runtime = 'edge';
export const alt = 'efBazaar eFootball account marketplace';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#080a0f',
          color: '#f8fafc',
          fontFamily: 'Inter, Arial, sans-serif',
          padding: 56,
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'linear-gradient(120deg, rgba(34,211,238,0.22), rgba(16,185,129,0.12) 45%, rgba(245,158,11,0.16)), linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)',
            backgroundSize: '100% 100%, 54px 54px, 54px 54px',
          }}
        />

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
                fontSize: 26,
                color: '#67e8f9',
                marginBottom: 34,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: 'linear-gradient(135deg, #22d3ee, #10b981)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#061014',
                  fontWeight: 900,
                }}
              >
                eF
              </div>
              Telegram-first marketplace
            </div>

            <div style={{ fontSize: 96, lineHeight: 0.95, fontWeight: 900, letterSpacing: 0 }}>
              {siteConfig.name}
            </div>
            <div
              style={{
                marginTop: 24,
                fontSize: 38,
                lineHeight: 1.18,
                color: '#d7f8ff',
                maxWidth: 620,
              }}
            >
              eFootball akkountlarini xavfsiz sotish va sotib olish.
            </div>

            <div style={{ display: 'flex', gap: 14, marginTop: 40, fontSize: 23 }}>
              {['Division', 'Team strength', 'Coins', 'Pro players'].map((item) => (
                <div
                  key={item}
                  style={{
                    border: '1px solid rgba(255,255,255,0.16)',
                    background: 'rgba(255,255,255,0.08)',
                    padding: '10px 16px',
                    borderRadius: 999,
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
              border: '1px solid rgba(255,255,255,0.18)',
              background: 'rgba(9,14,23,0.88)',
              borderRadius: 28,
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 18,
              boxShadow: '0 28px 90px rgba(0,0,0,0.35)',
            }}
          >
            <div style={{ fontSize: 20, color: '#9ca3af' }}>Live listing preview</div>
            <div style={{ fontSize: 34, fontWeight: 800 }}>Division 1 account</div>
            <div
              style={{
                height: 150,
                borderRadius: 20,
                background:
                  'linear-gradient(135deg, rgba(34,211,238,0.28), rgba(16,185,129,0.18)), #111827',
                border: '1px solid rgba(103,232,249,0.28)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 54,
                fontWeight: 900,
                color: '#ecfeff',
              }}
            >
              3100+
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}>
              <span style={{ color: '#a7f3d0' }}>Google linked</span>
              <span>450k UZS</span>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                background: '#22d3ee',
                color: '#061014',
                borderRadius: 14,
                padding: '14px 18px',
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              Start with Telegram
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
