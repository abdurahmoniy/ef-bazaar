# mail (mail-frontend)

mail.efbazaar.uz — foydalanuvchining escrow pochta qutilarini **faqat o'qish** uchun webmail.
Savdo paytida akkount shu qutilarga bog'lanadi; foydalanuvchi Konami xatlarini shu yerda ko'radi.
Ma'lumot trade-service'ning mail API'sidan keladi (`/api/v1/mail/**`, IMAP orqali).

| | |
|---|---|
| Stack | Next.js 16, React 19, TypeScript, Tailwind, Vitest |
| Port | 3000 |
| Domen | mail.efbazaar.uz. Mailcow'ning o'zi alohida: mailcow.efbazaar.uz (`/SOGo`, ActiveSync, `/api`) |

## Tuzilma

| Yo'l | Nima |
|---|---|
| `/` | Foydalanuvchi qutilari ro'yxati |
| `/[mailboxId]` | Inbox |
| `/[mailboxId]/[messageId]` | Xat |
| `src/app/api/trade/[...path]` | trade-service'ga proxy (brauzer backendni to'g'ridan ko'rmaydi) |
| `src/lib/api.ts`, `mail-server.ts` | Server tomoni so'rovlari — `INTERNAL_API_BASE_URL` orqali |
| `src/proxy.ts` | Sessiya yo'q bo'lsa asosiy sayt login'iga yo'naltiradi (API so'rovlariga 401) |

## Qulflangan qutilar

Tarif limitidan oshgan quti `locked: true` bilan keladi (`unreadCount`/`lastActivityAt` null).
trade-service bunday quti uchun barcha endpointlarda 403 `mailbox_locked` qaytaradi. UI qulf
ekranini ko'rsatadi (`components/mail/locked-mailbox.tsx`): mazmun yo'q, xiralashtirilgan qatorlar
soxta. Sahifalar qulflangan qutida `getInbox`/`getMessage`ni chaqirmaydi; 403 `mailbox_locked`
kelsa ham shu ekran chiqadi. "Tarifni oshirish" -> asosiy sayt `/plans`; "Boshqa qutini qulflab,
shuni ochish" -> `/profile?mailbox=<id>#mailboxes`.

## Auth

Login faqat asosiy saytda (efbazaar.uz). Cookie `AUTH_COOKIE_DOMAIN` (`.efbazaar.uz`) orqali
ikkala subdomen uchun umumiy. Access token httpOnly cookie'da qoladi — brauzer kodidan
backend'ga to'g'ridan so'rov yubormang, Server Component / Route Handler ishlating.

## Konfiguratsiya

`INTERNAL_API_BASE_URL` (`http://nginx:8080/api`), `AUTH_COOKIE_DOMAIN`, `NEXT_PUBLIC_MAIN_SITE_URL`.

## Buyruqlar

```bash
npm ci --no-audit --no-fund
npm run test && npm run build
```
