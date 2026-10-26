# mail (mail-frontend)

mail.efbazaar.uz — foydalanuvchining escrow pochta qutilarini xatlarni o‘qish va pochta qutilarini boshqarish uchun webmail.
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

Desktop va mobil sidebar qisqa jami hisoblagich va “Qutilarni boshqarish” havolasini ko‘rsatadi.
Yangi /settings/mailboxes sahifasi autentifikatsiyadan keyin GET /api/trade/v1/mailboxes/slots va
GET /api/trade/v1/mailboxes orqali haqiqiy total/custom limitlar va qutilarni oladi.
Free — jami 3, Pro — jami 10, shundan 2 tagacha yangi custom quti; real qiymatlar API’dan.
Custom limiti jami limit ichida. STAFF hisoblagichi yashirin; eski yoki xato javoblar
noma’lum holat bo‘lib, nol yoki cheksiz deb taxmin qilinmaydi.

Limit tafsilotlaridagi exemptUsed sovg‘a/savdo qutilarini, resourceUsed ajratilgan
resurslarni bildiradi. Oddiy sig‘im va ulanmagan qutilar neytral ko‘rsatiladi;
faqat to‘layotgan/to‘lgan sig‘im holati ogohlantiriladi. Akkountga ulanmagan qutilar
serverda /marketplace/v1/accounts o‘qilgandagina aniqlanadi; xato bo‘lsa bog‘lanish
noma’lum qoladi. “Ulash” asosiy saytdagi mavjud Konami ulash oqimiga olib boradi.

Kirish tanlovi shu sahifada mavjud POST /api/trade/v1/mailboxes/{id}/unlock ga
lockInsteadId bilan faqat foydalanuvchi tasdiqlaganda yuboriladi. Sovg‘alar va faol
savdo qutilarini qulflash mumkin emas; backend xatosi tanlovni saqlagan holda ko‘rsatiladi.
Takroriy yuborish bloklanadi va sahifa/principal almashganda kutilayotgan so‘rov bekor qilinadi.

## Kirish holati va xatlarni saqlash

`accessState: ACTIVE|GRACE|RECOVERY` yangi javobda `locked` dan ustun. Eski javobda
`locked:true` kontent so‘rovlarini yubormaydigan konservativ ekran beradi. `GRACE` Pro
tugaganidan keyin 30 kun to‘liq o‘qishni, `RECOVERY` backend filtrlagan faqat muhim Konami
parol tiklash/xavfsizlik xatlarini beradi. Boshqa UID’larni backend rad etadi. Inbox va
xat ekranida haqiqiy `paidExpiresAt`/`graceEndsAt`, Pro uzaytirish va shu webmail boshqaruvida Free uchun
qutilarni tanlash havolalari bor. Pro uzayishi shu qutilarga kirishni tiklaydi.

Inbox’dagi “Eksport va xatlarni tozalash” ochiluvchi bo‘limi foydalanuvchi tasdig‘i bilan:

- `GET /api/trade/v1/mail/{id}/export?limit=100&beforeUid=...` → ZIP (.eml + manifest.json).
  Har qism foydalanuvchi bosganda yuklanadi; `X-Next-Before-Uid` keyingi qismni belgilaydi.
  Recovery’da ham egasining barcha xatlari uchun eksport mumkin. Avtomatik eksport yo‘q.
- Shu sahifadan 100 tagacha tanlangan oddiy xat uchun qaytmas o‘chirish tasdig‘idan so‘ng
  `POST /mail/{id}/cleanup {messageIds,confirmDelete:true}`. `criticalRecovery:true` va
  statusi noma’lum xatlar tanlanmaydi; backend nizo/huquqiy saqlashni qayta tekshiradi,
  xatolar tanlovni yo‘qotmasdan ko‘rsatiladi. Avtomatik arxiv/o‘chirish yo‘q.
- Xavfsiz quti bo‘shatish, Mailcow haqiqiy hajmi, o‘chirishning pending/failed/confirmed
  holati va isbotni tekshirish webmail /settings/mailboxes ichidagi “Hajm va qutini bo‘shatish” bo‘limida. Oddiy
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
