'use client';

import { useMemo } from 'react';

import type { InlineButtonRows } from '@/lib/bot-broadcast';
import { telegramHtmlToPreview } from '@/lib/telegram-html';

/**
 * Telegramning naqshli chat foni.
 *
 * <p>Tashqi rasm ishlatilmaydi — naqsh SVG sifatida shu yerda quriladi va
 * data URI bo'lib CSS'ga tushadi. Shuning uchun hech qanday tarmoq so'rovi
 * yo'q va fon offline ham ko'rinadi.
 *
 * <p>Emojilar efBazaar mavzusiga mos: futbol va o'yin. Telegramning o'z
 * naqshini nusxa ko'chirmaymiz — u Telegramning grafikasi.
 */
const PATTERN_EMOJI = ['⚽', '🏆', '🎮', '💎', '🔥', '⭐', '🎯', '🕹️'];

function buildPatternUrl(): string {
  const tile = 160;
  // Naqsh takrorlanganda ko'zga tashlanadigan "to'r" chiqmasligi uchun
  // emojilar tasodifiy emas, lekin notekis joylashtirilgan.
  const positions = [
    { x: 20, y: 34, size: 26, rotate: -12 },
    { x: 96, y: 20, size: 20, rotate: 14 },
    { x: 132, y: 76, size: 24, rotate: -6 },
    { x: 58, y: 82, size: 18, rotate: 20 },
    { x: 12, y: 118, size: 22, rotate: 8 },
    { x: 88, y: 134, size: 26, rotate: -16 },
    { x: 140, y: 130, size: 17, rotate: 10 },
    { x: 46, y: 8, size: 15, rotate: -20 },
  ];

  const glyphs = positions
    .map((p, i) => {
      const emoji = PATTERN_EMOJI[i % PATTERN_EMOJI.length];
      return `<text x="${p.x}" y="${p.y}" font-size="${p.size}" opacity="0.5" transform="rotate(${p.rotate} ${p.x} ${p.y})">${emoji}</text>`;
    })
    .join('');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${tile}" height="${tile}" viewBox="0 0 ${tile} ${tile}">${glyphs}</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

interface TelegramPreviewProps {
  html: string;
  bannerUrl: string | null;
  /**
   * Xabar ostidagi inline tugmalar. Start xabarida ular kodda belgilangan
   * va o'zgarmas; ommaviy xabarda admin o'zi yig'adi. Preview ikkalasini
   * ham bir xil chizadi — natija bitta Telegram xabari.
   */
  buttons: InlineButtonRows;
}

export function TelegramPreview({ html, bannerUrl, buttons }: TelegramPreviewProps) {
  const pattern = useMemo(buildPatternUrl, []);
  const rendered = useMemo(() => telegramHtmlToPreview(html), [html]);

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundImage: pattern,
        backgroundColor: '#8ea9c4',
        backgroundSize: '160px 160px',
      }}
    >
      <div className="max-w-[22rem] overflow-hidden rounded-2xl rounded-tl-md bg-white shadow-md">
        {bannerUrl && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={bannerUrl} alt="" className="block w-full" />
        )}

        <div className="px-3 py-2">
          {html.trim() ? (
            <div
              className="tg-preview whitespace-pre-wrap break-words text-[13px] leading-snug text-[#0f172a]"
              dangerouslySetInnerHTML={{ __html: rendered }}
            />
          ) : (
            <p className="text-[13px] italic text-slate-400">Matn bo&apos;sh</p>
          )}
        </div>

        {buttons.length > 0 && (
          <div className="space-y-px border-t border-slate-200 bg-slate-50">
            {buttons.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className="grid gap-px border-t border-slate-200 first:border-t-0"
                style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
              >
                {row.map((button, colIndex) => (
                  <div
                    key={colIndex}
                    className="truncate bg-slate-50 px-3 py-2 text-center text-[13px] font-medium text-[#3390ec]"
                  >
                    {button.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
