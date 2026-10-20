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

## Umumiy pochta sig‘imi

Sidebar desktop va mobil ko‘rinishda `GET /api/trade/v1/mailboxes/slots` dan haqiqiy
`totalUsed`/`totalLimit` va `customUsed`/`customLimit` sonlarini oladi. Free — jami 3,
Pro — jami 10, shundan 2 tagacha yangi custom quti. Custom limiti jami limit ichida;
ro‘yxat uzunligidan yoki alohida limitlar yig‘indisidan sig‘im taxmin qilinmaydi.
`exemptUsed` admin sovg‘alari va vaqtincha savdoda olingan escrow qutilarini alohida, `resourceUsed` resursdagi ajratilgan, shu jumladan uzilgan qutilarni
ko‘rsatadi. STAFF uchun quota yashirin; yangi total/custom maydonlari yo‘q eski javob yoki xatoda “Pochta limiti aniqlanmadi” chiqadi.
Mavjud custom quti Free’da ham umumiy pool ichida o‘qish uchun tanlanishi mumkin.

## Kirish holati va xatlarni saqlash

`accessState: ACTIVE|GRACE|RECOVERY` yangi javobda `locked` dan ustun. Eski javobda
`locked:true` kontent so‘rovlarini yubormaydigan konservativ ekran beradi. `GRACE` Pro
tugaganidan keyin 30 kun to‘liq o‘qishni, `RECOVERY` backend filtrlagan faqat muhim Konami
parol tiklash/xavfsizlik xatlarini beradi. Boshqa UID’larni backend rad etadi. Inbox va
xat ekranida haqiqiy `paidExpiresAt`/`graceEndsAt`, Pro uzaytirish va profilda Free uchun
3 qutini tanlash havolalari bor. Pro uzayishi shu qutilarga kirishni tiklaydi.

Inbox’dagi “Eksport va xatlarni tozalash” ochiluvchi bo‘limi foydalanuvchi tasdig‘i bilan:

- `GET /api/trade/v1/mail/{id}/export?limit=100&beforeUid=...` → ZIP (.eml + manifest.json).
  Har qism foydalanuvchi bosganda yuklanadi; `X-Next-Before-Uid` keyingi qismni belgilaydi.
  Recovery’da ham egasining barcha xatlari uchun eksport mumkin. Avtomatik eksport yo‘q.
- Shu sahifadan 100 tagacha tanlangan oddiy xat uchun qaytmas o‘chirish tasdig‘idan so‘ng
  `POST /mail/{id}/cleanup {messageIds,confirmDelete:true}`. `criticalRecovery:true` va
  statusi noma’lum xatlar tanlanmaydi; backend nizo/huquqiy saqlashni qayta tekshiradi,
  xatolar tanlovni yo‘qotmasdan ko‘rsatiladi. Avtomatik arxiv/o‘chirish yo‘q.
- Xavfsiz quti bo‘shatish, Mailcow haqiqiy hajmi, o‘chirishning pending/failed/confirmed
  holati va isbotni tekshirish asosiy sayt profili resurslar panelida. Webmail’dagi oddiy
  hisobdan uzish allocationni bo‘shatmaydi va Konami ko‘chirish isboti hisoblanmaydi.

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
