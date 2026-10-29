import { Info } from 'lucide-react';

/**
 * Telegram Login Widget Telegram'ning OAuth session'iga bog'liq —
 * agar foydalanuvchi `oauth.telegram.org`'da boshqa nomer bilan
 * login bo'lgan bo'lsa, widget faqat shu akkauntni ko'rsatadi.
 * Bizning tomondan bu sessionni clear qilishning yo'li yo'q.
 */
export function TelegramSwitchHint() {
  return (
    <details className="group border-t border-border pt-2 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
        <Info aria-hidden="true" className="h-4 w-4 shrink-0" />
        Boshqa Telegram akkaunti bilan kirish
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-9 text-muted-foreground">
        <li>
          <a
            href="https://web.telegram.org/k"
            target="_blank"
            rel="noreferrer"
            className="text-[hsl(var(--primary-text))] underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          >
            web.telegram.org
          </a>
          {' '}da kerakli nomer bilan kiring va bu sahifani yangilang
        </li>
        <li>Yoki brauzer'ning <b>inkognito</b> oynasida shu sahifani oching</li>
      </ul>
    </details>
  );
}
