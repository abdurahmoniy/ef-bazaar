# Task: oferta va maxfiylik siyosatini kodga va qonunga moslash

Sana: 2026-11-11. Manba: `frontend/src/lib/legal.ts` (`TERMS_VERSION = '2026-11-10'`),
`legal.test.ts`, `terms-consent-gate.tsx` va backend kodi bilan solishtirish.

> **Muhim:** bu tahlilni dasturchi ko'zi bilan qilingan. "B" va "C" bo'limlardagi
> yuridik bandlar O'zbekiston huquqshunosi tomonidan tasdiqlanishi shart —
> qonun moddalari bu yerda yo'nalish sifatida berilgan, yakuniy xulosa emas.

Belgilar: **[P0]** — nizoda bizga qarshi ishlaydi yoki qonun buzilishi xavfi, birinchi tuzatiladi;
**[P1]** — hujjat to'liq emas; **[P2]** — sayqal. **(tekshir)** — kodda oxirigacha tasdiqlanmagan, avval tekshiring.

## Holat (2026-11-11)

**Bajarildi** (`TERMS_VERSION = 2026-11-11`, `legal.ts`, `legal.test.ts`):
A2 (komissiya: sotuvda sotuvchi, almashishda tanlanadi — avvalgi tahlil sotuv uchun xato edi), A3, A4 matni,
A5 (Webvisor qoladi — egasi qarori; siyosatda ochiq yozildi), A6, A7 (ochiq qora ro‘yxat identifikator ko‘rsatmaydi — matn tuzatildi), A8, A9, A10,
A11, A12, B5 (Konami xavfi), B6, B7, B9, B11, B12, B14, C1, C3 (matn), C4.

**A1 bekor:** inson trade-admin rejimi kodda bor, lekin ishlatilmaydi — hujjatlarga kiritilmadi, test shuni qulflaydi.
Rejim yoqilsa, oferta va help avval yangilanishi shart.

**Qoldi:**
- **Egasi qarori bilan qilinmaydi:** B1 (rekvizitlar), B2 (yosh cheklovi), B3/B4/B8 (huquqshunos xulosasi).
- **A5 qoldig‘i** — Webvisor yoqiq: bir martalik parol, tasdiqlash kodi va karta formasi bloklariga `ym-hide-content` qo‘yish.
- **A4 kodi** — hisobni o‘chirishda ochiq savdo / qoldiq / ochiq yechish so‘rovi / blok tekshirilmaydi; payment va trade
  `user-deleted` ni tinglamaydi. Hujjat hozirgi holatni to‘g‘ri aytadi, lekin himoya kodda kerak.
- **A13** — rozilikni serverda tekshirish, «Rad etaman» yo‘li, versiyalar arxivi.
- Yechish uchun eng ko‘p kutish muddati — biznes qarori; hozir muddat va‘da qilinmagan.
- Rus tilidagi versiya (B13), hamkorlik/referal/turnir qoidalari (B10).

---

## A. Hujjat matni kod bilan mos kelmaydigan joylar

### A1. [P0] Inson trade-admin (HUMAN) savdosi ofertada umuman yo'q

Oferta 4-bo'lim faqat SMART oqimni tasvirlaydi: "pul garovda muzlatiladi", "xaridor tasdiqlagach pul o'tadi".
Kodda ikkinchi rejim bor va u boshqacha ishlaydi:

- `TradeEscrowSweeper.java:34` — "HUMAN trades never touched the wallet": pul hamyonda **muzlatilmaydi**.
- `TradeStateMachine.human()` — `WAITING_CLOSE_CONFIRM` da `TIMEOUT → SUCCESS`: tomonlar 24 soat jim tursa savdo
  **avtomatik yakunlangan** hisoblanadi ("silence is consent"). SMART'da esa jimlik = rad etish.
- `IN_PROGRESS` da muddat yo'q; 12 soat harakatsizlik platforma adminiga eskalatsiya qilinadi; savdo 168 soatgacha davom etishi mumkin.
- Trade-admin savdo yozishmalarini ko'radi va qadamlarni o'zi belgilaydi.

Qilinadigan ish:
- [ ] Ofertaga "Trade-admin orqali savdo" bandini qo'shish: pul qayerda turadi, kim javob beradi, jimlik tasdiq
      hisoblanishi, trade-admin platforma xodimimi yoki mustaqil shaxsmi, uning xatosi uchun kim javobgar.
- [ ] HUMAN savdoda to'lov aslida qanday o'tishini kodda/UI'da aniqlash **(tekshir)** va matnni shunga yozish.
      Agar pul platformadan tashqarida o'tsa — "Platformadan tashqaridagi o'tkazmalar uchun javob bermaymiz" (8-bo'lim)
      bilan ziddiyat chiqadi; buni ochiq hal qilish kerak.
- [ ] `legal.test.ts` ga ikkala rejim uchun alohida da'vo testlari.

### A2. [P0] Komissiyani kim to'lashi noto'g'ri yozilgan

Oferta: "komissiya ... sotuvchiga o'tadigan summadan ushlab qolinadi".
Kod: `AdminFeePayer { SELLER, BUYER, SPLIT }` (`TradeEscrowService.java:28-31`), UI'da tanlanadi
(`trade-fee-terms.tsx`). `BUYER`/`SPLIT` da xaridordan **narxdan ortiq** summa muzlatiladi.

- [ ] Matn: "Komissiyani kim to'lashi savdo taklifida ko'rsatiladi: sotuvchi, xaridor yoki teng ikkiga.
      Aniq summa taklifni qabul qilishdan oldin ko'rinadi."
- [ ] Komissiya stavkasi admin tomonidan o'zgartiriladi (`TradeCommissionService.updateConfig`). Ofertaga:
      "Stavka o'zgarishi mumkin; boshlangan savdoga taklif paytidagi stavka qo'llanadi" — kodda shunday ekanini
      tekshirish (`terms.findForUpdate` saqlangan shartlarni ishlatadi) **(tekshir)**.
- [ ] Eng kam savdo narxi bor (`minimumViablePriceTiyin`, e'lon uchun kamida 5 000 so'm) — ofertada yo'q.

### A3. [P0] Obmen (SWAP, SWAP_SURCHARGE) ofertada yo'q

Intro "almashish" deydi, lekin 4-bo'lim faqat sotuvni tasvirlaydi. Kodda `TradeKind = SALE | SWAP | SWAP_SURCHARGE`,
obmenda har tomonga alohida pochta, sotuvchi hamyonidan ham summa muzlatilishi mumkin
(`requireFunds(seller, amounts.sellerHold(), ...)`).

- [ ] Obmen bandi: ikkala tomon ham akkount topshiradi, doplata kimdan muzlatiladi, komissiya nimadan hisoblanadi,
      bir tomon topshirmasa nima bo'ladi.

### A4. [P0] Akkauntni o'chirish: hujjat va kod bir-biriga zid, pul va dalil masalasi ochiq

Maxfiylik 5-bo'lim: "profil ma'lumotlari o'chadi, e'lonlar va chatlar boshqa xizmatlardan ham tozalanadi".
Nizo qoidalari esa: "chatdagi yozishmalar o'chirilmaydi".

Kodda (`UserService.deleteById`, `UserDeletedConsumer`):
- auth qatori darhol hard-delete; marketplace faqat e'lonlarni soft-delete qiladi va like'larni o'chiradi —
  **chatlar o'chirilmaydi**;
- `payment-service` va `trade-service` `user-deleted` ni umuman tinglamaydi: hamyon, ledger, yechish ticketlari
  (karta, FIO, telefon), savdo tarixi, pochta qutilari qoladi;
- o'chirishdan oldin hamyon qoldig'i, ochiq savdo, ochiq yechish so'rovi, faol blok tekshirilmaydi **(tekshir)**.

Xavflar: foydalanuvchi puli bilan akkauntni o'chirsa pul "egasiz" qoladi; savdo o'rtasida o'chirish;
bloklangan odam o'chirib qayta ro'yxatdan o'tadi; "o'chirildi" degan va'da bajarilmaydi.

- [ ] Kod: o'chirishni bloklash — ochiq savdo, ochiq yechish so'rovi, noldan katta qoldiq yoki faol blok bo'lsa.
      (Alohida backend task; test-first, AGENTS.md bo'yicha.)
- [ ] Hujjat: nima o'chadi / nima qoladi va qancha muddat — aniq ro'yxat bilan. Chat xabarlari qarshi tomonda va
      nizo dalili sifatida saqlanishini ochiq yozish.
- [ ] Oferta 9-bo'limdagi "rozi bo'lmasangiz akkauntni o'chirishingiz mumkin" — avval pulni yechish tartibini qo'shish.

### A5. [P0] Yandex Metrika "sayt statistikasi" emas — sessiya yozuvi (Webvisor)

`layout.tsx:155`: `webvisor:true, clickmap:true, trackLinks:true`. Webvisor sahifa mazmuni va sichqoncha/klaviatura
harakatlarini Yandex serveriga (O'zbekistondan tashqarida) yuboradi. Bizning sahifalarda chat xabarlari,
bir martalik Konami paroli, tasdiqlash kodlari, hamyon qoldig'i va karta raqami kiritiladigan forma bor.

- [ ] Kod (tavsiya): Webvisor'ni o'chirish yoki kamida chat, savdo paneli, parol ochish, kod dialogi va hamyon
      formalariga `ym-hide-content` / `ym-disable-keys` qo'yish. Kiritilgan matn qay darajada yozilishini
      Metrika hujjatidan tekshirish **(tekshir)**.
- [ ] Hujjat: Webvisor qolsa — "sessiya yozuvi, bosishlar xaritasi, ma'lumot Yandex'ga chegaradan tashqariga
      uzatiladi" deb ochiq yozish va rozilik matniga kiritish.

### A6. [P1] Yig'iladigan ma'lumotlar ro'yxati to'liq emas

Maxfiylik 1-bo'limda yo'q, kodda bor:

| Ma'lumot | Qayerda |
|---|---|
| Yechishda karta egasining F.I.O., telefon, Telegram username | `WithdrawalService.open(..., holderName, phone, telegramUsername)` |
| Saqlangan bank kartalari (PAN shifrlangan) | trade-service `card` paketi |
| To'ldirishda bank xabarnomasi (summa, vaqt, karta) — userbot Humo bot chatini o'qiydi | `userbot-service`, `payment.card-credit-observed` |
| Escrow va custom pochta qutilariga kelgan xatlar; worker Konami xatlaridan kodlarni avtomatik o'qiydi | `smart-admin-worker/imap`, trade `mail` |
| Konami ID, akkount emaili, e'lon skrinshotlari | marketplace `account` |
| Bir martalik parol (Redis'da vaqtincha), shifrlangan savdo chati | trade-service |
| Ko'rishlar, qidiruv, sevimlilar, card interest, saqlangan qidiruvlar — tavsiya profili | recommendation-service |
| Kampaniya va referal cookie (`efbazaar_src`, `efbazaar_src_click`, `?ref=`, `?p=`) | `proxy.ts`, marketplace `campaign`, `referral` |
| Push token (Firebase Cloud Messaging — Google) | `firebase-push.ts`, marketplace `push` |
| Rasmiy kanalga a'zolik / chiqish hodisalari | bot `ChannelMemberTracker`, access-service |
| IP manzil (rate limit, server loglari) | auth `RateLimitFilter`, nginx **(saqlash muddatini tekshir)** |
| Qo'llab-quvvatlash chati, shikoyat matni va dalil xabarlari | marketplace `support`, `trust` |
| Trade-admin arizasi (sabab, kontakt) | auth `TradeAdminApplication` |
| Tarif xaridlari, rozilik versiyasi va vaqti | payment `plan_purchases`, auth `terms_*` |
| Turnir natijalari (Chempionat-X bilan SSO) | Gamer Card |

- [ ] 1-bo'limni shu jadval asosida qayta yozish (toifalarga bo'lib, oddiy tilda).
- [ ] 4-bo'lim ("Cookie") — barcha cookie va local/session storage ro'yxati: sessiya, mavzu, kampaniya, referal, Metrika.

### A7. [P1] "Kim ko'radi" bo'limi kam va qisman noto'g'ri

- "Savdo yozishmalarini trade-admin ko'radi" — lekin platforma admini **oddiy marketplace chatini ham** o'qiy oladi
  (`chat-admin`, admin transkript). Yozilmagan.
- "Doimiy bloklanganning Konami ID, Telegram ID/username va telefon raqami ochiq qora ro'yxatda ko'rsatiladi" —
  public DTO `BlacklistEntryResponse` da faqat `displayName, penaltyType, reason, confirmedComplaints, since,
  expiresAt` bor; identifikatorlar ichki tekshiruv uchun. `/blacklist` sahifasi aslida nimani ko'rsatishini
  tekshirib **(tekshir)**, matnni haqiqatga moslash. Telefonni ommaga chiqarish — alohida yuridik xavf (C3).
- Vaqtinchalik blok ham ro'yxatda chiqadimi (`expiresAt`, `active` maydonlari shuni ko'rsatadi) — matnda faqat "doimiy".
- Tashqi qabul qiluvchilar to'liq emas: Firebase/Google (push), YouTube (fon musiqasi iframe), Mailcow (o'z serverimiz),
  Chempionat-X, hamkor kanallar (referal/kampaniya statistikasi — shaxsiy ma'lumot berilmasligini tasdiqlash),
  to'lov admin Telegram guruhi (yechish xabarida karta oxirgi 4 raqami va ism).
- Sotuvchi profili: reyting, sotuvlar soni, "Tasdiqlangan" belgisi, Gamer Card, Pro belgisi ham ommaviy.

- [ ] 3-bo'limni qayta yozish: (a) ommaga ko'rinadi, (b) savdo qarshi tomoni ko'radi, (c) admin/trade-admin ko'radi,
      (d) tashqi xizmatlar.

### A8. [P1] Pullik tarif (Pro) ofertada yo'q

`payment-service` `plans/purchase`: Pro oyiga 30 000 so'm, hamyondan yechiladi, narx admin tomonidan o'zgaradi.
Tugagach pochta qutilari 30 kun GRACE → RECOVERY.

- [ ] Yangi bo'lim: nima beriladi, muddat, avtomatik uzaytirish yo'qligi, **pul qaytarilishi/qaytarilmasligi**,
      muddat tugaganda ma'lumot va qutilar bilan nima bo'lishi, narx o'zgarishi.

### A9. [P1] Pochta qutilari — egalik va kirish huquqi yozilmagan

Savdo natijasida xaridor efBazaar domenidagi pochtaga ega bo'ladi; akkountni tiklash shu pochtaga bog'liq.
Platforma texnik jihatdan qutiga kira oladi, parolni almashtiradi, limitdan oshsa kirishni cheklaydi.

- [ ] Ofertaga: quti platforma infratuzilmasida; platforma savdo uchun Konami xatlarini avtomatik o'qiydi;
      xizmat to'xtasa foydalanuvchiga emailni tashqi manzilga ko'chirish uchun muddat beriladi (kodda `release-check`
      oqimi bor); tarif tugaganda kirish cheklanishi; platforma xatlar yetib kelishini kafolatlamaydi.
- [ ] Maxfiylikka: xatlarni kim/nima o'qiydi, qancha saqlanadi.

### A10. [P1] Hamyon bandlari to'liq emas

- To'ldirish: eng kam 1 000 so'm, invoice 15 daqiqa amal qiladi, summa noyob bo'lishi uchun 100–1 000 so'mga
  oshirilishi mumkin (`bump-step-uzs`, `max-bump-uzs`) — yozilmagan.
- Userbot ishlamasa to'ldirish qabul qilinmaydi — "xizmat vaqtincha ishlamasligi mumkin" bandi yo'q.
- Yechish muddati va'da qilinmagan (to'g'ri), lekin **eng ko'p kutish muddati** ham yo'q — nizoda bizga qarshi.
  Masalan "odatda 24 soat, ko'pi bilan N ish kuni" deb yozish.
- Yechishda komissiya bor/yo'qligi, kimning kartasiga yechish mumkinligi (faqat o'z kartasi?) yozilmagan.
- Hamyondagi pul foiz keltirmaydi, omonat emas; noto'g'ri tushgan pulni platforma qaytarib yechib olishi mumkin
  (`CardDebitConsumer`) — band kerak.
- Blok qo'yilganda qoldiq bilan nima bo'ladi — yozilmagan (A11).

### A11. [P1] Blok oqibatlari yozilmagan

Kodda blok: `ACTIVE` e'lonlar `BLOCKED` bo'ladi, chat cheklanadi (`BlacklistGuard`). Trade/payment blokni
tekshirmaydi **(tekshir)** — ya'ni bloklangan odam pul yecha oladi.

- [ ] Ofertaga: blok nimani cheklaydi, hamyondagi pul qaytariladimi, firibgarlik isbotlansa pul ushlab turiladimi
      (ushlab turish kerak bo'lsa — kodda ham amalga oshirish), apellyatsiya tartibi va muddati.
- [ ] "Asossiz shikoyat" jazosi: kodda 3 ta rad etilgan shikoyatdan keyin ogohlantirish
      (`FALSE_REPORT_WARNING_AT = 3`) — help'dagi "ham ogohlantiriladi" bilan mos, ofertaga ham shu raqam.

### A12. [P1] SMART savdo tafsilotlari

Oferta umumiy yozilgan (muddatlar "savdo oynasida ko'rinadi") — bu yaxshi, lekin quyidagilar yo'q:
- Platforma aybi bilan savdo uzilsa (pochta ochilmadi → `PROVISION_FAILED → ORPHANED`, worker navbati) pul qaytishi.
- Rad etilgan/muddati o'tgan savdoda pochta sotuvchiga qaytishi va parolni almashtirish majburiyati.
- Xaridor 24 soat jim tursa savdo rad etilgan hisoblanishi (help'da bor, ofertada yo'q).
- Tasdiqlangandan keyin sotuvchi akkountni qaytarib olsa — oqibat (blok, zararni qoplash).
- "Xaridor akkountni olib pul to'lamay ketishi mumkin emas" — mutlaq kafolat. Yumshatish:
  "pul garovda turgani uchun..." qismi qolsin, lekin `legal.test.ts` shu jumlani qulflagan — test bilan birga o'zgartirish
  kerakmi, huquqshunos bilan hal qilish.

### A13. [P2] Rozilik mexanizmi

- `TermsConsentGate`: tekshiruv xato bersa oyna chiqmaydi (`catch(() => undefined)`), faqat frontend darajasida.
  Backend rozilik yo'q foydalanuvchiga savdo/to'lov qilishga ruxsat beradi. Kamida savdo taklifi va to'ldirish
  oldidan `termsVersion` ni serverda tekshirish.
- Rad etish tugmasi va rad etganda nima bo'lishi yo'q.
- Faqat versiya va birinchi vaqt saqlanadi. Dalil uchun: har versiya matnining arxivi (git tag yetarli, lekin
  `/oferta?v=2026-11-10` kabi ochiq arxiv yaxshiroq), har qabul vaqti, IP/qurilma **(yuridik maslahat)**.
- Bitta tugma ikkita hujjatga rozilik oladi — shaxsiy ma'lumotga rozilik alohida belgi bo'lishi kerak bo'lishi mumkin (B3).
- Hujjatda "kuchga kirgan sana" va versiya ko'rsatilmagan — `LegalDocumentView` ga qo'shish.
- "Keyingi kirishingizda rozilik qayta so'raladi" — muhim o'zgarishlar haqida oldindan (masalan 7 kun) xabar berish.

---

## B. Hujjatda umuman yo'q yuridik bandlar (huquqshunos bilan)

1. **[P0] Tomon rekvizitlari.** Ofertada platforma egasi kim ekani yo'q: yuridik shaxs/YaTT nomi, STIR, manzil,
   email, telefon. Ommaviy oferta (FK 367, 369-moddalar) tomon aniq bo'lmasa zaif. "Elektron tijorat to'g'risida"gi
   qonun sotuvchi/operator haqidagi ma'lumotni saytda ko'rsatishni talab qiladi.
2. **[P0] Yosh va muomala layoqati.** O'yin auditoriyasi yosh. 18 yoshdan kichiklar uchun qoida (ota-ona roziligi yoki
   taqiq) yozilmagan — voyaga yetmagan bilan tuzilgan savdo bekor qilinishi mumkin.
3. **[P0] Shaxsiy ma'lumotlar qonuni (O'RQ-547).** Tekshirish: (a) operator sifatida ma'lumotlar bazasini davlat
   reyestrida ro'yxatdan o'tkazish; (b) O'zbekiston fuqarolari ma'lumotini O'zbekiston hududidagi serverda saqlash
   (27-1-modda) — serverlar qayerda; (c) chegaradan tashqariga uzatish (Yandex, Google/Firebase, Telegram) uchun asos;
   (d) rozilikning shakli, qaytarib olish tartibi, so'rovga javob muddati; (e) saqlash muddatlari.
   Siyosatga operator, maqsad, huquqiy asos, muddat, mas'ul shaxs kontaktini qo'shish.
4. **[P0] To'lov faoliyati.** Foydalanuvchi pulini shaxsiy/kompaniya kartasida ushlab turish va hamyon yuritish —
   "To'lovlar va to'lov tizimlari to'g'risida"gi qonun bo'yicha litsenziya talab qiladigan faoliyat bo'lishi mumkin.
   Bu hujjat matni bilan hal bo'lmaydi; huquqshunos xulosasi kerak. Matnda kamida: pul platformaning qaysi hisobida
   turadi, bu bank omonati emas.
5. **[P0] Konami qoidalari.** Akkount sotish Konami foydalanuvchi shartnomasiga zid bo'lishi mumkin. Hozir faqat
   "Konami bloklasa javob bermaymiz" bor. Qo'shish: foydalanuvchi bu xavfni biladi va o'z zimmasiga oladi;
   platforma akkountning Konami qoidalariga mosligini kafolatlamaydi; Konami talabi bilan e'lon olib tashlanishi mumkin.
6. **[P1] Javobgarlikni cheklash.** Texnik nosozlik, uzilish, uchinchi tomon (Telegram, bank, Konami, Mailcow)
   aybi, fors-major; javobgarlikning yuqori chegarasi (masalan savdo summasi/komissiya). "Xizmat boricha (as is)".
   Iste'molchi huquqlari qonuni bo'yicha qaysi cheklovlar haqiqiy emasligini huquqshunos aytsin.
7. **[P1] Nizolarni hal qilish.** Talabnoma (pretenziya) tartibi va javob muddati, admin qarorining maqomi,
   sud (qaysi sud), admin qaroriga e'tiroz. Hozir faqat "O'zbekiston qonunchiligi qo'llanadi".
8. **[P1] Soliq.** Sotuvchi o'z daromadi bo'yicha soliq majburiyatini o'zi bajaradi; platforma soliq agenti emas
   (yoki agent — huquqshunos aniqlasin).
9. **[P1] Kontent va intellektual mulk.** Foydalanuvchi yuklagan skrinshot/matndan foydalanish huquqi (e'lonni
   kanalda, botda, reklamada ko'rsatish), taqiqlangan kontent, moderatsiya va e'lonni olib tashlash huquqi.
10. **[P1] Hamkorlik, referal, kanal reklamasi, turnirlar.** Pul to'lanadigan alohida dasturlar — alohida qoidalar yoki
    ofertada qisqa bandlar + havola.
11. **[P1] Xizmatni to'xtatish.** Platforma yopilsa: qoldiqlarni yechish muddati, pochta qutilarini ko'chirish.
12. **[P2] Atamalar bo'limi.** Akkount (o'yin) / hisob (efBazaar) / garov / savdo / trade-admin / hamyon — bir marta ta'rif.
13. **[P2] Rus tilidagi versiya** va qaysi til ustunligi.
14. **[P2] Bildirishnomalar** yuridik ahamiyatga ega aloqa kanali ekani (bot xabari = rasmiy xabar).

---

## C. Alohida xavflar (qaror kerak)

- **C1.** Chatni admin o'qishi va kontaktni avtomatik yashirish (`ContactShield`) — ofertada "chat moderatsiya qilinadi,
  kontaktlar yashiriladi" deb yozilishi kerak; hozir faqat taqiq bor.
- **C2.** Ko'rinmas YouTube ijrosi (fon musiqasi) YouTube shartlariga zid ekani `frontend/README.md` da tan olingan —
  hujjatlarga emas, mahsulotga tegishli xavf; maxfiylikda YouTube'ga so'rov ketishi yozilsin.
- **C3.** Ochiq qora ro'yxat = shaxsiy ma'lumotni ommaga oshkor qilish + sha'n va qadr-qimmat da'vosi xavfi.
  Kerak: oldindan rozilik (ofertada bor, kuchaytirish), dalil saqlash, apellyatsiya, noto'g'ri kiritilsa o'chirish
  tartibi, telefon raqamini ommaga chiqarmaslik.
- **C4.** Majburiy kanal obunasi (access-service) — kirish sharti ekani ofertada yo'q.

---

## D. Bajarish tartibi

1. A1, A2, A3, A4 (matn), A5, B1, B2, B5 — matn tuzatishlari; `TERMS_VERSION` ni yangilash (hamma qayta rozilik beradi).
2. A4 (kod), A5 (kod), A13 (server tekshiruvi) — alohida PR'lar, test-first.
3. A6–A12 — maxfiylik va ofertani to'ldirish.
4. B3, B4 — huquqshunos xulosasi; natijaga qarab matn va infratuzilma.
5. Har da'vo uchun `legal.test.ts` da test (hozirgi uslubda): komissiya to'lovchisi, HUMAN jimlik = tasdiq,
   SMART jimlik = rad, obmen, Pro qaytarilmasligi, o'chirish cheklovlari, Webvisor, to'liq qabul qiluvchilar ro'yxati.
6. Oferta, help (`help-data.ts`) va nizo qoidalari bir xil raqam va atamalarni ishlatishini tekshiruvchi umumiy test
   (24 soat, 30 daqiqa, 10 000 so'm, 1/3/5 shikoyat, 7 kun).
7. `frontend/README.md` dagi huquqiy hujjatlar bandini shu commit'da yangilash.

## Tayyor bo'lish mezoni

- Hujjatdagi har raqam va va'da kodda manbasi bilan test orqali qulflangan.
- "(tekshir)" belgili har band tekshirilib, natijasi shu faylga yozilgan.
- B bo'limi bo'yicha huquqshunosning yozma xulosasi olingan.
- `npm run typecheck && npm run lint && npm test && npm run build` o'tadi.
