import { Info } from 'lucide-react';

/**
 * Telegram Login Widget Telegram'ning OAuth session'iga bog'liq —
 * agar foydalanuvchi `oauth.telegram.org`'da boshqa nomer bilan
 * login bo'lgan bo'lsa, widget faqat shu akkauntni ko'rsatadi.
 * Bizning tomondan bu sessionni clear qilishning yo'li yo'q.
 */
export function TelegramSwitchHint() {
  return (
    <details className="group rounded-xl border border-border/50 bg-muted/30 px-4 py-3 text-sm">
      <summary className="flex cursor-pointer items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
        <Info className="h-4 w-4 shrink-0" />
        Boshqa Telegram akkaunti bilan kirmoqchimisiz?
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-9 text-muted-foreground">
        <li>
          <a
            href="https://web.telegram.org/k"
            target="_blank"
            rel="noreferrer"
            className="text-cyber-cyan hover:underline"
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
