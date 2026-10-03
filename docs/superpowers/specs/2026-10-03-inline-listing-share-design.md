# Inline ulashish (`@EfBazaarBot` orqali e'lon ulashish) — dizayn

Sana: 2026-10-03 · Holat: tasdiqlangan dizayn, spec ko'rib chiqilishi kutilmoqda
Vizual variantlar: https://claude.ai/artifact/PVdfQaCnYeMrKMZemqFy9w (tanlangani — 1-variant, "Maqola turi")

## 1. Maqsad

Telegram'ini efBazaar akkountiga bog'lagan foydalanuvchi istalgan chatda (guruh, shaxsiy chat,
kanal izohi) `@EfBazaarBot` deb yozadi. Unga **o'zining faol e'lonlari** ro'yxati chiqadi
(muqova + narx/division + coinlar/o'yinchilar). Bittasini tanlasa, chatga **rasmiy kanaldagi
formatda** post tushadi: muqova katta preview sifatida, kanal matni va Mini App'ga olib boruvchi
"🛒 E'lonni ochish" inline tugmasi. Post tepasida Telegram "via @EfBazaarBot" yozadi.

Foyda: sotuvchi e'lonini boshqa guruhlarda bir harakat bilan, chiroyli va bir xil formatda ulashadi;
har ulashish efBazaar reklamasi.

**Doiradan tashqari (hozircha):** boshqalarning e'lonlarini / butun bozorni qidirish; ulashishlar
statistikasi (`chosen_inline_result`); custom emoji; bir nechta rasm (albom). "Kanal boshqaruvi"
userbot vazifasi to'xtatilgan, bu ishga tegilmaydi.

## 2. Telegram cheklovlari (dizaynni belgilaydi)

- Inline natija albom bo'la olmaydi — faqat **muqova** (`mediaMessageIds[0]`, kanal postidagi bilan bir xil).
- Ro'yxatda rasm va matnni birga faqat **maqola** (`InlineQueryResultArticle`) turi ko'rsatadi. Shuning
  uchun natija maqola: kichik rasm `thumbnail_url` (ochiq HTTPS URL), yuboriladigan xabar — matn +
  `link_preview_options` (muqova URL'i, `prefer_large_media`, `show_above_text`) — muqova matn
  tepasida katta chiqadi.
- Bot yaratgan kontentda custom emoji ishonchli emas; kanal postlari ham hozir custom emoji'siz —
  format to'liq takrorlanadi.
- Natijalar `is_personal = true`, `cache_time = 10` s (xatoda 0).

## 3. Arxitektura

```
Telegram ──inline_query(from.id, query, offset)──► bot
bot ──GET /internal/inline/listings?telegramId&q&offset (X-Internal-Secret)──► marketplace
marketplace ──GET /internal/users/by-telegram-id/{id}──► auth   (mavjud endpoint)
marketplace ◄── ACTIVE e'lonlar ── o'z DB
bot ──answerInlineQuery(results, button, is_personal, cache_time, next_offset)──► Telegram
```

Bot DB'siz va Telegram bilan ishlaydigan yagona komponent bo'lib qoladi; mantiq (kim, qaysi e'lon,
qaysi matn) — marketplace'da, kanal postini ham u yasaydi.

### 3.1 marketplace: ichki endpoint

`GET /internal/inline/listings?telegramId={long}&q={string?}&offset={int, default 0}` —
`X-Internal-Secret` majburiy (mavjud ichki endpointlar naqshida), nginx tashqariga chiqarmaydi.

1. `telegramId` → auth `by-telegram-id` (mavjud client orqali). Topilmasa → `{"linked": false, "items": [], "nextOffset": null}`.
2. Shu foydalanuvchining `ACTIVE` e'lonlari (`SOLD`, `DELETED`, `BLOCKED` kirmaydi), eng yangisi birinchi.
   `q` bo'sh bo'lmasa: `valuablePlayers` yoki `description` ichida registrga befarq qidiruv.
3. Sahifa 20 ta; `nextOffset` = keyingi offset yoki `null`.
4. Har e'lon uchun element:

| Maydon | Qiymat |
|---|---|
| `listingId` | UUID (natija id'si — Telegram 64 baytgacha ruxsat beradi) |
| `title` | `"{narx} so'm · Division {n}"` (narx bo'sh joy bilan guruhlangan, masalan `2 500 000`) |
| `description` | `"iOS {ios} · Android {android} · Kuch {teamStrength}"` + yangi qatorda birinchi 3 ta `valuablePlayers` vergul bilan |
| `captionHtml` | `ChannelPostCaption.of(listing, deepLink.webUrl(id, null))` — rasmiy kanaldagi bilan aynan bir xil |
| `coverFileId` | `mediaMessageIds[0]` yoki `null` |
| `buttonUrl` | `deepLink.buttonUrl(id, null)` — rasmiy kanal tugmasidagi Mini App havolasi |

Javob: `{"linked": true, "items": [...], "nextOffset": 20 | null}`.

### 3.2 bot: inline handler

- `inline_query` update'ini qabul qiladi (webhook va long-polling ikkalasida ham; `allowed_updates`
  ga `inline_query` qo'shiladi).
- marketplace'ga so'rov (1,5 s timeout). Har element → `InlineQueryResultArticle`:
  - `id` = `listingId`, `title`, `description`;
  - `thumbnail_url` = `{PUBLIC_BASE}/bot/photo/{coverFileId}` (cover bo'lmasa yo'q);
  - `input_message_content` = `InputTextMessageContent(captionHtml, parse_mode=HTML,
    link_preview_options={url: thumbnail_url, prefer_large_media: true, show_above_text: true})`
    (cover bo'lmasa `is_disabled: true`); matn 4096 dan oshsa qisqartiriladi;
  - `reply_markup` = bitta URL tugma "🛒 E'lonni ochish" → `buttonUrl`.
- `answerInlineQuery(results, is_personal=true, cache_time=10, next_offset)`.
- Ro'yxat tepasidagi tugma (`InlineQueryResultsButton`, `web_app` → Mini App):
  - `linked=false` → "Telegram'ni efBazaar'ga bog'lash" → Mini App profil sahifasi;
  - `linked=true` va birinchi sahifa bo'sh, `q` bo'sh → "E'lon joylash" → Mini App e'lon yaratish sahifasi;
  - marketplace xatosi/timeout → "Hozir e'lonlarni olib bo'lmadi — qayta urinib ko'ring" (Mini App bosh sahifasi), `cache_time=0`.
- `PUBLIC_BASE` va Mini App URL'lari mavjud konfiguratsiyadan (`APP_BASE_URL`, `TELEGRAM_MINI_APP_URL`).

### 3.3 Ochiq URL va rasm

`/bot/photo/{fileId}` nginx'da tashqaridan ochiq (`location /bot/`); Telegram kichik rasm va preview'ni
shu URL'dan o'zi yuklaydi. Qo'shimcha infra kerak emas.

## 4. Xavfsizlik

- Kimligi faqat Telegram yuborgan `from.id` dan; so'rov matni filtr sifatidagina ishlatiladi —
  boshqaning e'lonini olib bo'lmaydi.
- Endpoint ichki (`X-Internal-Secret`), javobda telefon/email/shaxsiy ma'lumot yo'q — faqat kanal
  postida allaqachon ochiq bo'lgan ma'lumot.
- Bloklangan sotuvchining e'lonlari `BLOCKED` — ro'yxatga tushmaydi.

## 5. Xatolar

| Holat | Natija |
|---|---|
| auth/marketplace javob bermadi (1,5 s) | bo'sh ro'yxat + "Hozir e'lonlarni olib bo'lmadi" tugmasi, `cache_time=0`, WARN log |
| Telegram bog'lanmagan | bo'sh ro'yxat + "Telegram'ni bog'lash" tugmasi |
| Faol e'lon yo'q | bo'sh ro'yxat + "E'lon joylash" tugmasi |
| E'londa rasm yo'q | natija rasmsiz, preview o'chiq |
| Matn > 4096 | qisqartiriladi |
| Telegram rasmni ololmadi | preview chiqmaydi, matn va tugma baribir yetadi |

## 6. Test

- **marketplace (IT, `mvn verify`):** faqat o'z `ACTIVE` e'lonlari (SOLD/DELETED/BLOCKED va boshqa
  foydalanuvchi e'lonlari yo'q); bog'lanmagan → `linked=false`; `q` bo'yicha qidiruv; 20 talik sahifa
  va `nextOffset`; `captionHtml` rasmiy kanal matni bilan bir xil; `buttonUrl` rasmiy kanal tugmasi
  bilan bir xil; secret'siz → 401; `title`/`description` formati.
- **bot (unit, Telegram'siz):** element → maqola natijasi (thumbnail URL, link preview opsiyalari,
  tugma, HTML parse mode); cover yo'q holati; uchala yuqori tugma holati; timeout → bo'sh natija
  `cache_time=0`; `is_personal=true`, `cache_time=10`, `next_offset` uzatiladi; `allowed_updates`
  da `inline_query`.
- **Qo'lda:** haqiqiy Telegram'da guruh va shaxsiy chatda (mobil va Telegram Desktop) — ro'yxat,
  qidiruv, post ko'rinishi, tugma Mini App'ni ochishi, bog'lanmagan akkount holati.

## 7. Hujjatlar

`bot/README.md` (inline rejim, yangi update turi), `backend/marketplace-service/README.md` (ichki
endpoint), BotFather'da inline rejim yoqilgani va placeholder matni haqida eslatma.
