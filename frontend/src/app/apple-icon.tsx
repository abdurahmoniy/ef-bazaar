import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = {
  width: 180,
  height: 180,
};
export const contentType = 'image/png';

export default function AppleIcon() {
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
          color: '#ecfeff',
          fontSize: 62,
          fontWeight: 900,
          fontFamily: 'Inter, Arial, sans-serif',
        }}
      >
        <div
          style={{
            width: 142,
            height: 142,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 32,
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
