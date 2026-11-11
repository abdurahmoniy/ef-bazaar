# Task: yordam markazi (`/help`) matnlarini ravon o'zbek tiliga keltirish

Sana: 2026-11-11. Manba: `frontend/src/lib/help-data.ts` (23 maqola, 6 toifa), `help-data.test.ts`,
`frontend/src/app/help/page.tsx` (metadata va FAQ JSON-LD).

Maqsad: matn oddiy foydalanuvchi bir o'qishda tushunadigan, gaplari bir-biriga bog'langan, atamalari bir xil
bo'lsin. Help nizoda dalil bo'ladi — **mazmun o'zgarmaydi**, faqat til. Mazmun xatolari alohida (4-bo'lim).

## Holat (2026-11-11)

**Bajarildi:** lug‘at va uslub qoidalari (`help-data.ts` boshida), barcha maqolalar, toifalar, `HelpView` va sahifa
metadata‘si qayta yozildi; menyu va footer «Yordam markazi». Yangi maqolalar: Pro tarifi, blok va qora ro‘yxat,
hisobni o‘chirish. Almashish savdosi va to‘ldirish raqamlari qo‘shildi. Uslub va oferta bilan moslik testlari bor.

**Qilinmadi:**
- Trade-admin maqolasi — rejim ishlatilmaydi.
- Imlo belgilari (ʻ / ʼ) — testlar va qidiruvga tegadi, alohida PR.
- Maqola `id` lari o‘zgarmadi (`100-percent-secure-trade-guarantee` ham) — tashqi havolalar buzilmasin.
- Matnni haqiqiy foydalanuvchilarga o‘qitib ko‘rish.

---

## 1. Yagona atamalar lug'ati (avval shuni kelishib oling)

Hozir bir tushuncha uchun bir nechta so'z ishlatilgan. Bitta variant tanlanadi va hamma joyda (help, oferta,
UI tugmalari) shu qo'llanadi.

| Tushuncha | Hozir uchraydi | Tavsiya |
|---|---|---|
| O'yin akkounti | akkount | **akkount** |
| efBazaar'dagi profil | akkaunt, hisob, profil, "Akkount xavfsizligi" (profil ma'nosida!) | **hisob** (sahifa nomi sifatida "profil") |
| Escrow | Garov, Garov (Escrow), Garov (Xavfsiz bitim), Xavfsiz savdo | **garov** (kichik harf); "(escrow)" faqat birinchi marta |
| Trade | savdo, bitim | **savdo** |
| Almashish | obmen, Obmen (Almashtirish), almashtirish | **almashish**; "obmen" qavsda bir marta, teglarda qoladi |
| Qo'shimcha to'lov | doplata | **ustama to'lov** ("doplata" teglarda) |
| Coins | tangalar, coin, Android Coins | **tanga** |
| Division | diviziyon, divizion, Division | **divizion** (oferta shunday yozadi) |
| Jamoa kuchi | jamoa kuchi, kuch, sila (teg) | **jamoa kuchi** |
| Email | email, pochta, Pochta | manzil — **email**, quti — **pochta qutisi** |
| Support | qo'llab-quvvatlash xizmati / chati / sahifasi | **qo'llab-quvvatlash** |
| Blacklist | Qora ro'yxat (Blacklist), Xavfsizlik markazi, Xavfsizlik sahifasi | **qora ro'yxat** |
| Bog'langan do'kon | bog'lanish, ulanish, havola, bog'langan akkount | **Google Play / Game Center bog'lanishi** |
| Push | lahzali bildirishnoma (push) | **bildirishnoma** |
| Star cards | yulduz kartalar | **yulduz kartalar** (qoladi) |
| Shikoyat tugmasi | "Shikoyat" | UI'dagi aniq nom bilan bir xil |

- [ ] Lug'atni `help-data.ts` boshiga izoh sifatida yoki `docs/` ga qo'yish; oferta ham shu lug'atga moslanadi.
- [ ] Brend: har joyda **efBazaar** (`faq-division-meaning` da "eFBazaar" — xato).

## 2. Uslub qoidalari

1. **Gap o'rtasida bosh harf yo'q.** "Hamyon va To'lovlar", "Xavfsiz savdo va Garov", "Konami ID va Pochta
   almashtirish", "Narx belgilash va Komissiya", "Qo'llanma" → faqat birinchi so'z va atoqli otlar bosh harfda.
2. **"Sarlavha: izoh" qolipini kamaytirish.** "Muzlatilgan to'lov: Savdo boshlanganda..." o'rniga to'liq gap.
   Qolip kerak bo'lsa, ikki nuqtadan keyin kichik harf. "Komissiya nima uchun kerak?: ..." — "?:" xato.
3. **Bitta murojaat shakli:** "siz" + buyruq mayli ("bosing", "kiriting"). Hozir "kiradi / kirasiz / kiring" aralash
   (masalan `konami-id-transfer-guide` 1–3-qadam "sotuvchi kiradi", 4-qadam "almashtiring" — kim almashtiradi?).
   Har qadamda kim bajarishi aniq bo'lsin: "Sotuvchi: ...", "Xaridor: ...".
4. **Bir gap — bir fikr.** Tire va ikki nuqta bilan ulangan uzun gaplarni bo'lish
   (masalan `100-percent...` 2-band: uch fikr bitta gapda).
5. **Ruscha va inglizcha kalkalar:** "1-sekundda" → "bir zumda"; "lahzali" → "darhol"; "P2P" → olib tashlash;
   "WebApp" → "Mini App"; "widgeti orqali tasdiqlang" → "Telegram oynasida tasdiqlang"; "sof summa" qoladi;
   "Smart Admin" → "avtomatik tekshiruv" (ichki nom, foydalanuvchi bilmaydi); "FAQ" → "Savol-javob";
   "Blacklist", "Escrow", "push" — qavsdan olib tashlash.
6. **Reklama ohangi yo'q.** "to'liq shaffof", "to'liq qo'llab-quvvatlaydi", "oltin qoidalari", "elita liga",
   "osonlikcha", "hech qanday kutilmagan" — olib tashlash yoki aniq fakt bilan almashtirish.
7. **Emoji (❌ ✅) o'rniga so'z:** "Qilmang: ..." / "Qiling: ..." yoki ikki alohida ro'yxat.
8. **Raqamli qadamlar** faqat ketma-ket amal bo'lsa. `how-escrow-works` da 6 qadamdan keyin raqamsiz 7-band bor —
   xulosa sifatida ajratish.
9. **Bog'lovchilar:** qadamlar orasida "shundan keyin", "agar ... bo'lsa", "shuning uchun" bilan mantiqiy ulanish;
   hozir ko'p band bir-biridan uzilgan alohida gaplar.
10. **Imlo:** oʻ/gʻ uchun ʻ (U+02BB), tutuq belgisi uchun ʼ (U+02BC). Hozir ikkalasi ham ‘ (U+2018) — "e‘lon",
    "ma‘lumot" tutuq bilan yozilishi kerak. **Diqqat:** `help-data.test.ts` va `legal.test.ts` regexlari ‘ ga
    bog'langan — almashtirilsa testlar ham birga yangilanadi; qidiruv (`searchHelpItems`) apostrofsiz yozilgan
    so'rovni ham topishi kerak (normalizatsiya qo'shish). Bu ish hajmi katta bo'lsa — alohida PR.
11. **Sonlar:** "10 000 so'm", "24 soat", "30 daqiqa" — bir xil formatda, ajralmas bo'shliq bilan.

## 3. Maqolalar bo'yicha aniq tuzatishlar

| Maqola (`id`) | Muammo | Yo'nalish |
|---|---|---|
| `how-to-login` | "1-sekundda", "parolsiz", "widgeti", "WebApp"; 3-band "Tasdiqlangan" haqida — keyingi maqolani takrorlaydi | Qisqartirish, takrorni olib tashlash |
| `gamer-card-setup` | "o'zingiz haqingizda" → "o'zingiz haqida"; "diviziyon" teg | Imlo |
| `telegram-bot-benefits` | "e'lonlaringizga bo'lgan qiziqishlar", "bitim holatlari", "lahzali bildirishnoma (push)", "start bosing" | "Botni ishga tushiring", "savdo qadamlari" |
| `why-link-telegram-google` | "Akkount xavfsizligi" — bu yerda efBazaar hisobi nazarda tutilgan; "osonlikcha" | "Hisobga qayta kirish" |
| `100-percent-secure-trade-guarantee` | `id` va'da beradi ("100 percent"); 2-band uchta fikr; "pul ham, akkount ham hech kimga o'tmaydi" — noaniq | `id` ni `escrow-protection` ga o'zgartirish (eski havola uchun yo'naltirish), bandlarni bo'lish |
| `how-escrow-works` | Sarlavha "Garov (Xavfsiz bitim) tizimi"; 6-qadamda to'rt fikr; "Pochta:", "Parol:" yorliqlari | "Garov orqali savdo qanday o'tadi?"; 6-qadamni "Tasdiqlasangiz" / "Rad etsangiz" ga bo'lish |
| `dispute-rules` | Har band bitta juda uzun gap, qavs va sanoqlar ichma-ich; eng muhim maqola eng qiyin o'qiladi | Har bandni 2–3 qisqa gapga bo'lish, sanoqlarni ro'yxat qilish; jazo zinapoyasini alohida qatorlarda |
| `scam-prevention-rules` | "oltin qoidalari", emoji, "P2P", "(Blacklist)" | Ikki ro'yxat: "Qilmang" / "Qiling" |
| `konami-id-transfer-guide` | Sarlavhada bosh harflar; kim bajarishi aralash; 5-band juda uzun | Rollarni ajratish |
| `how-to-find-accounts` | "saralash" (aslida filtrlash); 2-band uzun; "Yurakcha" | "filtrlash", bandni bo'lish |
| `buyer-seller-chat-rules` | "Keraklisini" — nimaning? ; 4-band sabab-oqibat ikki nuqta bilan | "Kerakli chatni ..."; "chunki" bilan ulash |
| `how-to-create-listing` | "Diviziyon (D1-D4+)", "Platforma ulanishlari", "savdolashish / obmen variantlari" | Lug'at bo'yicha |
| `exchange-modes-explained` | "naqd pul" (hamyon — naqd emas), "tengma-teng", "doplata", "to'liq qo'llab-quvvatlaydi" | "pulga sotish", "ustama to'lov" |
| `transparent-pricing-commission` | Reklama ohangi, "?:", "Smart Admin", "server xavfsizligi" | Qisqa va faktli: komissiya qachon, kimdan, qancha ko'rinadi |
| `how-to-top-up-wallet` | "biroz vaqt olishi mumkin", "muddati cheklangan" — noaniq | Aniq raqam (4-bo'limga qarang) |
| `how-to-withdraw-funds` | "Mablag'ni kartaga yechib olish qoidalari" — og'ir | "Pulni kartaga qanday yechaman?" |
| `faq-division-meaning` | "eFBazaar", "elita liga", "Diviziyon" | Imlo, soddalashtirish |
| `faq-coins-split` | "telefon tizimi", "Android Coins" | "qurilmangiz (Android yoki iOS)" |
| Toifalar | "Xavfsiz savdo va Garov", "Hamyon va To'lovlar", `faq` qisqa nomi "FAQ", "obmen" tavsifda | Lug'at va bosh harf qoidasi |
| Tugmalar | `/blacklist` uchun uch xil nom: "Xavfsizlik markazi", "Xavfsizlik sahifasi", "Qora ro'yxatni ko'rish" | Bitta nom |
| `page.tsx` metadata | "Yordam va Qo'llanma", "obmen qilish", "Garov (Escrow)" | Lug'at bo'yicha |

**Sarlavhalar** foydalanuvchi savoli shaklida bir xil bo'lsin ("... qanday ...?"), hozir savol, ot birikma va
"qoidalari" aralash.

## 4. Til ishi davomida topilgan mazmun kamchiliklari

Bular til emas, fakt. Avval kodda tekshiring, keyin matnga kiriting; `legal-docs-fix.md` bilan bir xil bo'lishi shart.

- [ ] **Komissiya** (`transparent-pricing-commission`): "sof summa to'liq hamyoningizga o'tkaziladi" — komissiyani
      xaridor yoki ikkalasi teng to'lashi ham mumkin (`AdminFeePayer: SELLER | BUYER | SPLIT`). Uchala holatni yozish.
- [ ] **Trade-admin (inson) orqali savdo** help'da umuman yo'q; u garov oqimidan farq qiladi (pul hamyonda
      muzlatilmaydi, 24 soat jimlik = tasdiq). Alohida maqola kerak.
- [ ] **Almashish savdosi** qanday o'tishi (ikki pochta, ustama to'lov kimdan muzlatiladi) — faqat e'lon variantlari
      tushuntirilgan.
- [ ] **Pro tarif va pochta qutilari** haqida maqola yo'q (`/plans`, `/mailboxes/custom`).
- [ ] **To'ldirish:** eng kam summa 1 000 so'm, so'rov 15 daqiqa amal qiladi, summa bir necha yuz so'mga farq qilishi
      mumkin (noyob summa) — "muddati cheklangan" o'rniga shu raqamlar.
- [ ] `how-escrow-works` 1-qadam "sotuvchi taklif yuboradi" — taklifni xaridor ham yubora oladimi
      (`TradeProposalService`) tekshirish; 2-qadam pul aynan qachon muzlatilishi (`WAITING_PAYMENT` 30 daqiqa) tekshirish.
- [ ] `buyer-seller-chat-rules`: "Narx kelishuvli bo'lsa" — UI'dagi belgi nomi bilan bir xil qilish.
- [ ] `dispute-rules`: asossiz shikoyat uchun ogohlantirish 3-rad etilgan shikoyatda beriladi — raqamni yozish.
- [ ] Akkauntni o'chirish, blok oqibatlari, apellyatsiya — help'da yo'q.

## 5. Bajarish tartibi

1. Lug'at (1-bo'lim) va uslub qoidalarini (2-bo'lim) tasdiqlash.
2. Avval testlar: `help-data.test.ts` ga uslub testlari —
   taqiqlangan so'zlar ro'yxati (`Escrow`, `Blacklist`, `P2P`, `WebApp`, `doplata` kontentda, `diviziyon`, `eFBazaar`,
   `bitim`), emoji yo'qligi, "?:" yo'qligi, bir `actionUrl` uchun bitta `actionLabel`, band uzunligi chegarasi
   (masalan 220 belgi).
3. Maqolalarni toifa bo'yicha qayta yozish: xavfsizlik → hamyon → xaridor → sotuvchi → boshlash → savol-javob.
   Mavjud da'vo testlari (kafolat, qaytarilmaslik, 10 000 so'm va h.k.) o'tishda davom etishi kerak.
4. `id` o'zgarsa (`100-percent-...`) — eski `/help#...` havolasi yangi maqolani ochishi uchun moslik jadvali va test.
5. Har maqolani ovoz chiqarib o'qib tekshirish; iloji bo'lsa 2–3 haqiqiy foydalanuvchiga ko'rsatish.
6. Oferta va nizo qoidalari bilan atama va raqamlar mosligini solishtirish.
7. `frontend/README.md` dagi yordam markazi bandini yangilash; `npm run typecheck && npm run lint && npm test && npm run build`.

## Namuna (uslub uchun, yakuniy matn emas)

Hozir:
> Sotuvchi uchun kafolat: Xaridor akkountni olib pul to'lamay ketishi mumkin emas. Pul faqat xaridor tasdiqlaganda
> o'tadi, rad etilgan yoki muddati o'tgan savdoda esa pochta sotuvchiga qaytadi — shunda Konami parolini darhol almashtiring.

Tavsiya:
> Sotuvchi sifatida siz ham himoyalangansiz. Pul garovda turgani uchun xaridor akkountni olib, pul to'lamay ketishi
> mumkin emas. Agar xaridor savdoni rad etsa yoki muddat o'tib ketsa, pochta sizga qaytadi. Shunda darhol Konami
> parolini almashtiring.
