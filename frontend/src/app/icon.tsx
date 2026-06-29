import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 64,
  height: 64,
};
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#080a0f',
          borderRadius: 16,
          color: '#ecfeff',
          fontSize: 24,
          fontWeight: 900,
          fontFamily: 'Inter, Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: 52,
            height: 52,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 14,
            background: 'linear-gradient(135deg, #22d3ee, #10b981)',
            color: '#061014',
          }}
        >
          eF
        </div>
      </div>
    ),
    size,
  );
}
