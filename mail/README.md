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

## Xatlarni ko'rsatish

HTML mavjud bo'lsa, trade-service Jsoup orqali tozalagan HTML ko'rsatiladi; aks holda
oddiy matn HTML sifatida talqin qilinmaydi va bo'shliqlar/qatorlar saqlanadi.
Ikkala formatdagi matn ichidagi HTTP(S) URL, domen va email manzillari Linkify orqali
bosiladigan havolaga aylanadi (protokolsiz domenlar uchun HTTPS). HTML ichidagi mavjud
havolalar, ro'yxatlar va jadvallar saqlanadi; `pre`/`code` ichiga yangi havola qo'shilmaydi.
Yangi havolalar `target="_blank"`, `rel="noopener noreferrer"` bilan ochiladi.
Mobil ekranda (768px dan kichik) uzun havolalar bir qatorda `…` bilan qisqartirib
ko'rsatiladi. Havolaning to'liq manzili va screen reader matni saqlanadi. Desktopda
uzun URL matni keyingi qatorga o'tadi.

HTML `html-react-parser` bilan React elementlariga o'tkaziladi, Linkify esa matnga havola
qo'shadi. Entity va URL parametrlari buzilmasligi uchun matn/havola atributlarini React
escape qiladi. Bu kutubxonalar HTML sanayzeri emas: faqat API tozalagan `bodyHtml` parse qilinadi.
Script, iframe, rasm va yuboruvchining CSS uslublarini bloklash siyosati backendda qoladi.

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
