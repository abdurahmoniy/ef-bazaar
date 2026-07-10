const VIEWBOX = 100;
const BRAND_VIOLET = '#6835de';

interface BrandMarkOGProps {
  size: number;
  radius?: number;
}

/**
 * Same glyph as BrandMark (circular bowl + crossbar + ball), rebuilt from
 * plain divs because next/og's Satori renderer only reliably supports
 * HTML/CSS, not arbitrary inline SVG. Coordinates are the SVG viewBox
 * numbers scaled to the requested pixel size, so it stays visually
 * identical to the header logo at every favicon/OG size.
 */
export function BrandMarkOG({ size, radius }: BrandMarkOGProps) {
  const scale = size / VIEWBOX;
  const circle = { cx: 46 * scale, cy: 52 * scale, r: 24 * scale, sw: 14 * scale };
  const barX1 = 24 * scale;
  const barX2 = 76 * scale;
  const ball = { cx: 85 * scale, r: 9 * scale };
  const cornerRadius = radius ?? size * 0.28;

  return (
    <div
      style={{
        position: 'relative',
        width: size,
        height: size,
        display: 'flex',
        background: BRAND_VIOLET,
        borderRadius: cornerRadius,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: circle.cx - circle.r,
          top: circle.cy - circle.r,
          width: circle.r * 2,
          height: circle.r * 2,
          borderRadius: '50%',
          border: `${circle.sw}px solid #ffffff`,
          boxSizing: 'border-box',
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: barX1,
          top: circle.cy - circle.sw / 2,
          width: barX2 - barX1,
          height: circle.sw,
          background: '#ffffff',
          borderRadius: circle.sw / 2,
          display: 'flex',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: ball.cx - ball.r,
          top: circle.cy - ball.r,
          width: ball.r * 2,
          height: ball.r * 2,
          borderRadius: '50%',
          background: '#ffffff',
          display: 'flex',
        }}
      />
    </div>
  );
}
