export type HelpCategory = 'all' | 'start' | 'safety' | 'buyer' | 'seller' | 'wallet' | 'faq';

export interface HelpCategoryMeta {
  id: HelpCategory;
  label: string;
  shortLabel: string;
  description: string;
  iconName: string;
}

export interface HelpItem {
  id: string;
  category: Exclude<HelpCategory, 'all'>;
  title: string;
  summary: string;
  content: string[];
  tags: string[];
  featured?: boolean;
  actionUrl?: string;
  actionLabel?: string;
}

/** Savdo paneli va kanal postlari shu manzilga havola beradi. */
export const DISPUTE_RULES_ID = 'dispute-rules';
export const DISPUTE_RULES_HREF = `/help#${DISPUTE_RULES_ID}`;

/**
 * Yozish qoidalari (help va oferta uchun bir xil):
 * - "akkount" — eFootball o'yin akkounti, "hisob" — efBazaar'dagi foydalanuvchi hisobi;
 * - garov, savdo, almashish, ustama to'lov, tanga, divizion, jamoa kuchi,
 *   qo'llab-quvvatlash, qora ro'yxat — har doim shu so'zlar; inglizcha/ruscha
 *   muqobillari (escrow, obmen, doplata, blacklist) faqat qidiruv teglarida;
 * - sarlavha savol shaklida, gap o'rtasida bosh harf yo'q, bir gap — bir fikr;
 * - har raqam (muddat, summa, jazo) backend qoidasiga mos — help-data.test.ts tekshiradi.
 */
export const HELP_CATEGORIES: readonly HelpCategoryMeta[] = [
  {
    id: 'all',
    label: 'Barchasi',
    shortLabel: 'Barchasi',
    description: 'Barcha qo‘llanmalar',
    iconName: 'LayoutGrid',
  },
  {
    id: 'start',
    label: 'Boshlash',
    shortLabel: 'Boshlash',
    description: 'Kirish, hisob va Telegram bot',
    iconName: 'Sparkles',
  },
  {
    id: 'safety',
    label: 'Garov va xavfsizlik',
    shortLabel: 'Xavfsizlik',
    description: 'Garov orqali savdo, nizo qoidalari va firibgarlardan himoya',
    iconName: 'ShieldCheck',
  },
  {
    id: 'buyer',
    label: 'Xaridor qo‘llanmasi',
    shortLabel: 'Xaridor',
    description: 'Akkount qidirish va sotuvchi bilan yozishish',
    iconName: 'ShoppingBag',
  },
  {
    id: 'seller',
    label: 'Sotuvchi qo‘llanmasi',
    shortLabel: 'Sotuvchi',
    description: 'E‘lon joylash, narx, komissiya va almashish',
    iconName: 'UploadCloud',
  },
  {
    id: 'wallet',
    label: 'Hamyon va to‘lovlar',
    shortLabel: 'Hamyon',
    description: 'Hamyonni to‘ldirish va pul yechish',
    iconName: 'Wallet',
  },
  {
    id: 'faq',
    label: 'Savol-javob',
    shortLabel: 'Savollar',
    description: 'Ko‘p so‘raladigan savollarga qisqa javoblar',
    iconName: 'HelpCircle',
  },
] as const;

export const HELP_ITEMS: readonly HelpItem[] = [
  // Boshlash
  {
    id: 'how-to-login',
    category: 'start',
    title: 'Platformaga qanday kiraman?',
    summary: 'efBazaar’ga Telegram yoki Google hisobingiz orqali kirasiz. Alohida parol kerak emas.',
    content: [
      'Saytda «Kirish» tugmasini bosing va Telegram oynasida kirishni tasdiqlang. Google orqali kirish ham mumkin.',
      'Platformani Telegram bot ichidagi Mini App orqali ochsangiz, hisobingizga avtomatik kirasiz.',
      'Birinchi kirishda ommaviy oferta va maxfiylik siyosatiga rozilik so‘raladi. Kirish uchun rasmiy Telegram kanalga a‘zo bo‘lish talab qilinishi mumkin.',
    ],
    tags: ['login', 'kirish', 'telegram', 'google', 'profil', 'avtorizatsiya', 'oferta'],
    featured: true,
    actionUrl: '/auth/login',
    actionLabel: 'Kirish',
  },
  {
    id: 'gamer-card-setup',
    category: 'start',
    title: 'Gamer Card nima va uni qanday to‘ldiraman?',
    summary: 'Gamer Card — eFootball o‘yinchisi sifatidagi tashrif qog‘ozingiz: platformangiz, o‘zingiz haqida qisqa matn va turnir natijalaringiz.',
    content: [
      'Profil sahifasidagi Gamer Card bo‘limini oching. O‘yin platformasini (Android, iOS yoki ikkalasi) tanlang va o‘zingiz haqida qisqacha yozing.',
      'efBazaar turnirlarida qatnashsangiz, turnir natijalaringiz kartaga avtomatik qo‘shiladi.',
      'Tayyor kartani rasm sifatida saqlab, Telegram yoki ijtimoiy tarmoqlarda ulashishingiz mumkin.',
    ],
    tags: ['gamer card', 'profil', 'turnir', 'karta'],
    actionUrl: '/profile',
    actionLabel: 'Profilga o‘tish',
  },
  {
    id: 'telegram-bot-benefits',
    category: 'start',
    title: 'Telegram bot nima uchun kerak?',
    summary: 'Bot yangi chat xabarlari va savdo qadamlari haqida sizga darhol xabar beradi.',
    content: [
      'Botni ishga tushiring va efBazaar hisobingizga ulang.',
      'Shundan keyin kimdir sizga chatda yozsa yoki e‘loningiz bo‘yicha chat ochsa, bot xabar yuboradi.',
      'Garov orqali savdoda ham har qadam bot orqali bildiriladi: taklif keldi, pul muzlatildi, navbat sizda, savdo yakunlandi. Savdo qadamlarining muddati cheklangan, shuning uchun bot xabarlarini o‘chirib qo‘ymang.',
    ],
    tags: ['bot', 'telegram bot', 'bildirishnoma', 'xabarlar', 'notification', 'push'],
  },
  {
    id: 'why-link-telegram-google',
    category: 'start',
    title: 'Nega Telegram va Google hisoblarini ulash kerak?',
    summary: 'Telegram chat va savdo uchun shart. Google esa profilga «Tasdiqlangan» belgisini beradi va zaxira kirish yo‘li bo‘ladi.',
    content: [
      'Telegram ulanmagan bo‘lsa, sotuvchi bilan chat ocha olmaysiz. Xabar, taklif va savdo qadamlari haqidagi bildirishnomalar ham Telegram orqali keladi.',
      'Google hisobini ulasangiz, profilingizda «Tasdiqlangan» belgisi chiqadi va boshqa foydalanuvchilar uni ko‘radi.',
      'Ikkala hisob ulangan bo‘lsa, biriga kira olmay qolganingizda ikkinchisi orqali hamyoningiz va e‘lonlaringizga kirasiz.',
    ],
    tags: ['tasdiqlangan', 'verified', 'google', 'telegram', 'ishonch', 'profil', 'xavfsizlik'],
    featured: true,
    actionUrl: '/profile',
    actionLabel: 'Profilga o‘tish',
  },

  // Garov va xavfsizlik
  {
    id: '100-percent-secure-trade-guarantee',
    category: 'safety',
    title: 'Garov sizni qanday himoya qiladi?',
    summary: 'Garov orqali savdoda pul platformada muzlatiladi va sotuvchiga faqat xaridor akkountni tekshirib tasdiqlagandan keyin o‘tadi.',
    content: [
      'Savdo boshlanganda narx xaridorning hamyonida muzlatiladi. Sotuvchi pul platformada turganini ko‘radi va shundan keyin akkountni topshiradi.',
      'Sotuvchi himoyasi: pul garovda turgani uchun xaridor akkountni olib pul to‘lamay ketishi mumkin emas. Agar xaridor savdoni rad etsa yoki muddat o‘tib ketsa, pochta qutisi sotuvchiga qaytadi. Shunda sotuvchi darhol Konami parolini almashtirishi kerak.',
      'Xaridor himoyasi: akkount e‘londagidek bo‘lmasa yoki sotuvchi o‘z qadamini muddatida bajarmasa, muzlatilgan pul xaridorga to‘liq qaytadi. Komissiya olinmaydi.',
      'Tasdiqlash yakuniy qadam: xaridor tasdiqlagan zahoti pul sotuvchiga o‘tadi va buni ortga qaytarib bo‘lmaydi. Shuning uchun akkountni avval to‘liq tekshiring, keyin tasdiqlang.',
      'Kelishmovchilik chiqsa, «Nizo qoidalari»ga qarang va qo‘llab-quvvatlashga yozing.',
    ],
    tags: ['xavfsiz', 'kafolat', 'garov', 'escrow', 'himoya', 'ishonch'],
    featured: true,
    actionUrl: '/blacklist',
    actionLabel: 'Qora ro‘yxat',
  },
  {
    id: 'how-escrow-works',
    category: 'safety',
    title: 'Garov orqali savdo qanday o‘tadi?',
    summary: 'Savdo olti qadamdan iborat. Pul butun savdo davomida garovda turadi va sotuvchiga faqat xaridor tasdiqlagandan keyin o‘tadi.',
    content: [
      '1. Taklif. Chatda narxni kelishib oling. Keyin tomonlardan biri «Garov» orqali savdo taklifini yuboradi, ikkinchisi uni qabul qiladi.',
      '2. Pul muzlatiladi. Taklif qabul qilingan zahoti narx xaridorning hamyonida muzlatiladi. Shuning uchun xaridorning hamyonida oldindan yetarli pul bo‘lishi kerak.',
      '3. Email. Sotuvchi 30 daqiqa ichida akkount emailini savdo oynasida ko‘rsatilgan efBazaar pochta qutisiga o‘zgartiradi. Tizim akkount shu qutiga bog‘langanini o‘zi tekshiradi.',
      '4. Parol. Sotuvchi akkount parolini bir martalik xabar bilan yuboradi. Xaridor bu xabarni faqat bir marta ocha oladi.',
      '5. Tekshiruv. Xaridorga akkountni tekshirish uchun 24 soat beriladi. Tekshiruv paytida akkountda hech narsani o‘zgartirmang — faqat ko‘ring.',
      '6. Natija. «Tasdiqlash»ni bossangiz, pul sotuvchiga, pochta qutisi va akkount esa sizga o‘tadi; shundan keyin parolni almashtiring. «Rad etish»ni bossangiz yoki 24 soat javob bermasangiz, pul sizga to‘liq qaytadi.',
      'Biror qadam muddatida bajarilmasa, savdo bekor bo‘ladi va pul xaridorga komissiyasiz qaytadi.',
    ],
    tags: ['garov', 'escrow', 'xavfsiz savdo', 'trade', 'savdo', 'kafolat', 'qadamlar'],
    featured: true,
    actionUrl: '/marketplace',
    actionLabel: 'Bozorga o‘tish',
  },
  {
    id: DISPUTE_RULES_ID,
    category: 'safety',
    title: 'Nizo qoidalari',
    summary: 'Savdoda kelishmovchilik chiqsa nima qilish, qanday dalil kerak va qoidabuzarlikka qanday jazo berilishi.',
    content: [
      'Akkount e‘londagidek bo‘lmasa. Tekshiruv uchun berilgan 24 soat ichida «Rad etish» tugmasini bosing. Pul sizga avtomatik va to‘liq qaytadi, administrator aralashuvi kerak emas.',
      'Administrator qachon aralashadi. Rad etilgan savdo bo‘yicha tomonlar kelisha olmasa; sotuvchi tasdiqlangan akkountni qaytarib olsa; e‘londa jiddiy kamchilik yashirilgan bo‘lsa; kimdir to‘lovni platformadan tashqarida talab qilsa. Bunday holda e‘londagi «Shikoyat» tugmasini bosing yoki qo‘llab-quvvatlashga yozing.',
      'Qanday dalil qabul qilinadi. efBazaar chatidagi yozishmalar (ular saqlanadi va administrator ularni ko‘ra oladi), e‘lon matni va rasmlari, akkount ichidan olingan, vaqti ko‘rinib turgan skrinshot yoki ekran yozuvi, Konami ID. Tekshiruvni boshidan oxirigacha ekran yozuviga olishni tavsiya qilamiz.',
      'Nima taqiqlanadi. Tekshiruv paytida akkountda biror narsani o‘zgartirish: tanga sarflash, o‘yinchi sotish, boshqa akkount bog‘lash. Sotilgan akkountni qaytarib olish. E‘londa Google Play yoki Game Center bog‘lanishini yashirish. Soxta skrinshot yuborish. Savdoni garovsiz davom ettirishni taklif qilish.',
      'Nima himoyalanmaydi. Telegramda yoki boshqa joyda kelishilgan savdo. Konami akkountni keyinchalik bloklashi. E‘londa ochiq ko‘rsatilgan Google Play yoki Game Center bog‘lanishi oqibatlari.',
      'Jazolar tasdiqlangan shikoyatlar soniga bog‘liq. Birinchi shikoyat — ogohlantirish. Uchinchi shikoyat — 7 kunlik blok. Beshinchi shikoyat — doimiy blok. Bloklangan foydalanuvchi ochiq qora ro‘yxatga kiritiladi va e‘lonlari yashiriladi.',
      'Asossiz shikoyat ham qoidabuzarlik: uchta shikoyatingiz rad etilsa, o‘zingiz ogohlantirilasiz. Jazoni noto‘g‘ri deb hisoblasangiz, qo‘llab-quvvatlashga yozing — murojaat qayta ko‘rib chiqiladi.',
    ],
    tags: ['nizo', 'shikoyat', 'qoidalar', 'rad etish', 'dalil', 'qora royxat', 'garov', 'blok', 'jazo'],
    featured: true,
    actionUrl: '/support',
    actionLabel: 'Qo‘llab-quvvatlash',
  },
  {
    id: 'scam-prevention-rules',
    category: 'safety',
    title: 'Firibgarlardan qanday saqlanaman?',
    summary: 'Asosiy qoida bitta: pulni ham, akkountni ham faqat garov orqali bering.',
    content: [
      'Notanish odamning kartasiga oldindan pul o‘tkazmang. Garovdan tashqarida to‘langan pulni platforma qaytarib bera olmaydi.',
      'Akkount parolini faqat savdo oynasidagi bir martalik xabar orqali yuboring. Parol, Telegram yoki email tasdiqlash kodlarini oddiy chatga yozmang.',
      'efBazaar xodimlari sizdan parol yoki tasdiqlash kodini hech qachon so‘ramaydi. Kimdir o‘zini administrator deb tanishtirib kod so‘rasa — bu firibgar.',
      'Savdodan oldin qarshi tomonning profilini va qora ro‘yxatni tekshiring.',
      'Shubhali holatni ko‘rsangiz, e‘londagi «Shikoyat» tugmasini bosing yoki qo‘llab-quvvatlashga yozing.',
    ],
    tags: ['firibgar', 'scam', 'ogohlantirish', 'xavfsizlik', 'parol', 'qora royxat', 'blacklist'],
    featured: true,
    actionUrl: '/blacklist',
    actionLabel: 'Qora ro‘yxat',
  },
  {
    id: 'konami-id-transfer-guide',
    category: 'safety',
    title: 'Savdoda Konami ID emaili qanday o‘zgartiriladi?',
    summary: 'Sotuvchi akkount emailini efBazaar bergan pochta qutisiga o‘zgartiradi. Xaridor tasdiqlagach, shu quti unga o‘tadi.',
    content: [
      '1. Sotuvchi my.konami.net rasmiy saytida akkountga kiradi.',
      '2. Email bo‘limiga savdo oynasida ko‘rsatilgan efBazaar manzilini kiritadi.',
      '3. Konami shu manzilga tasdiqlash kodini yuboradi. Kod savdo oynasida ko‘rinadi — sotuvchi uni Konami saytiga kiritadi.',
      '4. Xaridor akkountni tasdiqlagach, pochta qutisi unga o‘tadi. Xaridor shundan keyin darhol Konami parolini almashtirishi kerak.',
      'Muhim: Google Play yoki Game Center bog‘lanishini akkountdan olib tashlab bo‘lmaydi. Savdoda faqat Konami ID o‘tadi, bog‘lanish esa eski egasida qoladi. Shuning uchun bog‘lanish e‘londa ko‘rsatilishi shart, xaridor esa bu xavfni bilgan holda qaror qiladi.',
    ],
    tags: ['konami', 'email', 'pochta', 'parol', 'transfer', '2fa', 'google play', 'game center'],
  },

  // Xaridor
  {
    id: 'how-to-find-accounts',
    category: 'buyer',
    title: 'Kerakli akkountni qanday topaman?',
    summary: 'Bozorda akkountlarni yulduz kartalar, divizion, jamoa kuchi, platforma va narx bo‘yicha filtrlash mumkin.',
    content: [
      'Filtrlarni oching va qidirayotgan yulduz kartangizni tanlang — masalan, Messi Epic yoki Ronaldo Show Time.',
      'Platformani tanlang: mobil, Steam yoki PlayStation. Mobil akkountlarni Android va iOS tangalari hamda Google Play yoki Game Center bog‘lanishi bo‘yicha ham filtrlash mumkin.',
      'Divizion va jamoa kuchini belgilang — masalan, 1-divizion va 3100 dan yuqori kuch.',
      'Yoqqan e‘lonni yurakcha tugmasi bilan sevimlilarga saqlang. Qidiruvni saqlab qo‘ysangiz, mos e‘lon chiqqanda xabar olasiz.',
    ],
    tags: ['qidiruv', 'filtr', 'epic', 'show time', 'big time', 'messi', 'ronaldo', 'd1', 'sevimlilar'],
    featured: true,
    actionUrl: '/marketplace',
    actionLabel: 'Bozorga o‘tish',
  },
  {
    id: 'buyer-seller-chat-rules',
    category: 'buyer',
    title: 'Sotuvchi bilan qanday bog‘lanaman?',
    summary: 'E‘lon sahifasidagi «Sotuvchi bilan bog‘lanish» tugmasi chat ochadi. Bir sotuvchi bilan bitta doimiy chat bo‘ladi.',
    content: [
      'E‘lon sahifasida «Sotuvchi bilan bog‘lanish» tugmasini bosing. Buning uchun Telegram hisobingiz ulangan bo‘lishi kerak.',
      'E‘londa savdolashish mumkinligi ko‘rsatilgan bo‘lsa, sotuvchiga o‘z narxingizni taklif qiling.',
      'Chat yopilmaydi. Shu sotuvchining boshqa akkountlari haqida ham shu chatda gaplashasiz. Kerakli chatni «Muhim» deb belgilab qo‘yishingiz mumkin.',
      'Telegram username, havola va telefon raqam chatda avtomatik yashiriladi, chunki platformadan tashqaridagi savdo garov bilan himoyalanmaydi.',
      'Kelishib olgach, savdoni shu chatning o‘zida garov orqali boshlang.',
    ],
    tags: ['chat', 'boglanish', 'savdolashish', 'xabar', 'kontakt'],
  },

  // Sotuvchi
  {
    id: 'how-to-create-listing',
    category: 'seller',
    title: 'E‘lonni qanday joylayman?',
    summary: 'To‘liq ma‘lumot va aniq skrinshotlar xaridorga akkountni savdodan oldin baholashga yordam beradi.',
    content: [
      '1. «Akkount joylash» yoki «+» tugmasini bosing.',
      '2. Asosiy ko‘rsatkichlarni kiriting: divizion, jamoa kuchi, Android va iOS tangalari soni.',
      '3. Akkountdagi eng qimmatli yulduz kartalarni tanlang: Epic, Big Time, Show Time va boshqalar.',
      '4. Akkountga Google Play yoki Game Center bog‘langan bo‘lsa, buni belgilang. Bog‘lanishni yashirish firibgarlik hisoblanadi.',
      '5. Narxni kiriting. Savdolashish mumkinligini va almashishga rozi ekaningizni belgilang.',
      '6. Rasmlarni yuklang: asosiy tarkib, zaxira o‘yinchilar va murabbiy.',
    ],
    tags: ['elon', 'joylash', 'sotish', 'narx', 'rasm', 'kartalar'],
    featured: true,
    actionUrl: '/marketplace/new',
    actionLabel: 'Akkount joylash',
  },
  {
    id: 'exchange-modes-explained',
    category: 'seller',
    title: 'Akkountni almashish qanday ishlaydi?',
    summary: 'Akkountni pulga sotish, boshqa akkountga almashish yoki ustama to‘lov bilan almashish mumkin. Almashish ham garov orqali o‘tadi.',
    content: [
      'E‘londa uch variantdan birini tanlaysiz. Faqat sotuv — akkount belgilangan narxda sotiladi. Faqat almashish — akkount boshqa akkountga almashtiriladi. Ustama to‘lov bilan almashish — akkountlar qiymati teng bo‘lmasa, bir tomon farqini pul bilan to‘laydi.',
      'Almashishni xohlasangiz, e‘lon tavsifida qanday akkount izlayotganingizni yozing.',
      'Almashish savdosida har ikki tomon o‘z akkountini alohida pochta qutisi orqali topshiradi. Ustama to‘lov uni to‘laydigan tomonning hamyonida muzlatiladi.',
      'Xizmat haqini kim to‘lashi taklifda tanlanadi: bir tomon yoki ikkalasi teng. Har kimning hamyonidan qancha muzlatilishi taklifni qabul qilishdan oldin ko‘rinadi.',
    ],
    tags: ['obmen', 'almashish', 'almashtirish', 'doplata', 'ustama', 'barter'],
  },
  {
    id: 'transparent-pricing-commission',
    category: 'seller',
    title: 'Komissiya qanday hisoblanadi?',
    summary: 'Sotuvda komissiya sotuvchiga o‘tadigan summadan ushlanadi. Qo‘lingizga tegadigan sof summani e‘lon yaratayotganda ko‘rasiz.',
    content: [
      'E‘lon narxini kiritganingizda tizim komissiyani hisoblaydi va sof summani — hamyoningizga tushadigan pulni ko‘rsatadi.',
      'Komissiya faqat savdo muvaffaqiyatli yakunlanganda olinadi. Bekor bo‘lgan yoki rad etilgan savdo uchun hech narsa to‘lamaysiz.',
      'Komissiya stavkasi o‘zgarishi mumkin, lekin boshlangan savdoga u ochilgan paytdagi stavka qo‘llanadi.',
    ],
    tags: ['narx', 'komissiya', 'sof summa', 'xizmat haqi', 'sotuvchi'],
    featured: true,
    actionUrl: '/marketplace/new',
    actionLabel: 'Akkount joylash',
  },

  // Hamyon va to'lovlar
  {
    id: 'how-to-top-up-wallet',
    category: 'wallet',
    title: 'Hamyonni qanday to‘ldiraman?',
    summary: 'Hamyon platforma kartasiga pul o‘tkazish orqali to‘ldiriladi. Har to‘ldirish uchun alohida aniq summa beriladi.',
    content: [
      '1. Hamyon sahifasida summani tanlang yoki kiriting. Eng kam summa — 1 000 so‘m.',
      '2. Ekranda platforma karta raqami va o‘tkaziladigan aniq summa chiqadi. To‘lovingizni boshqalarnikidan ajratish uchun bu summa siz kiritgan summadan bir oz farq qilishi mumkin.',
      '3. Bank ilovangizdan shu kartaga aynan shu summani 15 daqiqa ichida o‘tkazing.',
      '4. To‘lov tasdiqlangach, hamyon o‘zi yangilanadi. Tekshirish biroz vaqt olishi mumkin.',
      'Boshqa summa o‘tkazsangiz yoki 15 daqiqadan kechiksangiz, pul hamyonga avtomatik tushmaydi. Bunday holda to‘lov chekini qo‘llab-quvvatlashga yuboring — to‘lov qo‘lda tekshiriladi.',
    ],
    tags: ['hamyon', 'balans', 'toldirish', 'humo', 'karta', 'otkazma'],
    actionUrl: '/hamyon',
    actionLabel: 'Hamyonga o‘tish',
  },
  {
    id: 'how-to-withdraw-funds',
    category: 'wallet',
    title: 'Pulni kartaga qanday yechaman?',
    summary: 'Hamyon sahifasida yechish so‘rovini qoldirasiz, administrator pulni kartangizga qo‘lda o‘tkazadi.',
    content: [
      '1. Hamyon sahifasida «Pul yechish» tugmasini bosing. Karta raqami, karta egasining ismi va summani kiriting. Eng kam summa — 10 000 so‘m.',
      '2. So‘rov yaratilganda shu summa hamyoningizda band qilinadi.',
      '3. Administrator pulni kartangizga o‘tkazadi va so‘rovni yopadi. So‘rovlar navbat bilan bajariladi. So‘rov rad etilsa, band qilingan summa hamyoningizga qaytadi.',
      '4. Bir vaqtda faqat bitta ochiq so‘rov bo‘lishi mumkin. Yangisini avvalgisi yopilgandan keyin yuborasiz.',
      'Karta raqamini diqqat bilan tekshiring: noto‘g‘ri kartaga o‘tgan pulni qaytarib bo‘lmaydi.',
    ],
    tags: ['yechib olish', 'pul yechish', 'withdraw', 'karta', 'humo', 'uzcard'],
    actionUrl: '/hamyon',
    actionLabel: 'Hamyonga o‘tish',
  },

  // Savol-javob
  {
    id: 'faq-division-meaning',
    category: 'faq',
    title: 'Qaysi divizion yuqori — 1-chimi yoki 4-chimi?',
    summary: 'eFootball’da 1-divizion eng yuqori daraja hisoblanadi.',
    content: [
      'Divizion raqami qancha kichik bo‘lsa, daraja shuncha yuqori.',
      'efBazaar’da to‘rt daraja ishlatiladi: 1-divizion (eng yuqori), 2-divizion, 3-divizion va 4-divizion yoki undan past.',
    ],
    tags: ['diviziyon', 'divizion', 'd1', 'd2', 'd3', 'd4', 'daraja'],
  },
  {
    id: 'faq-coins-split',
    category: 'faq',
    title: 'Nega Android va iOS tangalari alohida ko‘rsatiladi?',
    summary: 'Android’da olingan tangalar iOS qurilmada, iOS’da olinganlari esa Android’da ishlamaydi.',
    content: [
      'Masalan, akkountda 5000 Android tangasi bo‘lsa, uni iPhone’da ochganingizda bu tangalar ko‘rinmaydi. Ular yo‘qolmaydi — Android qurilmada yana ko‘rinadi.',
      'Shuning uchun har bir e‘londa Android va iOS tangalari alohida yoziladi.',
      'Akkount olayotganda qaysi qurilmada o‘ynashingizni hisobga oling.',
    ],
    tags: ['tangalar', 'tanga', 'coins', 'android', 'ios'],
  },
  {
    id: 'faq-pro-plan',
    category: 'faq',
    title: 'Pro tarifi nima beradi?',
    summary: 'Pro — pullik oylik tarif: ko‘proq pochta qutisi, o‘z nomingizdagi pochta manzili va sotuvchi uchun qo‘shimcha vositalar.',
    content: [
      'Imkoniyatlarning to‘liq ro‘yxati va narxi tariflar sahifasida ko‘rsatilgan. Bepul tarifda 3 ta, Pro tarifida 10 ta pochta qutisi saqlash mumkin.',
      'To‘lov hamyondan, xaridni tasdiqlaganingizdan keyin yechiladi. Tarif o‘zi uzaymaydi: muddat tugashidan oldin eslatma keladi, uzaytirishni o‘zingiz qilasiz.',
      'Tarif uchun to‘langan pul qaytarilmaydi.',
      'Muddat tugasa, saqlangan ma‘lumotlaringiz o‘chmaydi. Limitdan ortiq pochta qutilari yana 30 kun to‘liq ochiq turadi, keyin ularda faqat akkountni tiklash uchun kerakli xatlar ko‘rinadi.',
    ],
    tags: ['pro', 'tarif', 'obuna', 'pochta', 'premium', 'narx'],
    actionUrl: '/plans',
    actionLabel: 'Tariflar',
  },
  {
    id: 'faq-block-and-blacklist',
    category: 'faq',
    title: 'Blok va qora ro‘yxat nima?',
    summary: 'Tasdiqlangan shikoyatlar uchun foydalanuvchi vaqtincha yoki doimiy bloklanadi va ochiq qora ro‘yxatda ko‘rsatiladi.',
    content: [
      'Blok davomida e‘lonlaringiz bozorda ko‘rinmaydi va chatdan foydalanish cheklanadi. Vaqtinchalik blok 7 kun davom etadi, keyin e‘lonlar o‘zi qaytadi.',
      'Qora ro‘yxatda foydalanuvchining ismi, blok sababi va tasdiqlangan shikoyatlar soni ko‘rinadi. Telefon raqam va Telegram username ko‘rsatilmaydi.',
      'Blok hamyondagi pulingizni yechib olishga to‘sqinlik qilmaydi.',
      'Blokni noto‘g‘ri deb hisoblasangiz, qo‘llab-quvvatlashga yozing.',
    ],
    tags: ['blok', 'qora royxat', 'blacklist', 'jazo', 'shikoyat', 'ban'],
    actionUrl: '/blacklist',
    actionLabel: 'Qora ro‘yxat',
  },
  {
    id: 'faq-delete-account',
    category: 'faq',
    title: 'Hisobimni qanday o‘chiraman?',
    summary: 'Hisob profil sahifasida o‘chiriladi. O‘chirilgan hisob tiklanmaydi, shuning uchun avval pulni yechib oling.',
    content: [
      'O‘chirishdan oldin ochiq savdolarni yakunlang va hamyondagi pulni kartangizga yechib oling.',
      'Hisob o‘chirilganda kirish ma‘lumotlaringiz o‘chadi va e‘lonlaringiz bozordan olinadi.',
      'Boshqa foydalanuvchilar bilan yozishmalaringiz, savdolar va to‘lovlar tarixi saqlanib qoladi: ular nizolarni hal qilish uchun kerak. Batafsil — maxfiylik siyosatida.',
    ],
    tags: ['ochirish', 'hisob', 'akkaunt', 'profil', 'delete', 'maxfiylik'],
    actionUrl: '/maxfiylik',
    actionLabel: 'Maxfiylik siyosati',
  },
  {
    id: 'faq-support-contact',
    category: 'faq',
    title: 'Qo‘llab-quvvatlash bilan qanday bog‘lanaman?',
    summary: 'Savol yoki nizo bo‘lsa, saytdagi qo‘llab-quvvatlash chatiga yozing.',
    content: [
      'Qo‘llab-quvvatlash sahifasida administrator bilan chat ochiladi.',
      'Savdo yoki e‘lon haqida yozayotgan bo‘lsangiz, uning havolasini ham yuboring — masala tezroq hal bo‘ladi.',
    ],
    tags: ['yordam', 'support', 'admin', 'nizo', 'aloqa', 'murojaat'],
    actionUrl: '/support',
    actionLabel: 'Qo‘llab-quvvatlash',
  },
] as const;

/**
 * Filter help items by category and/or text search query.
 */
export function searchHelpItems(query: string, category: HelpCategory = 'all'): HelpItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  
  return HELP_ITEMS.filter((item) => {
    const matchesCategory = category === 'all' || item.category === category;
    if (!matchesCategory) return false;

    if (!normalizedQuery) return true;

    const matchesTitle = item.title.toLowerCase().includes(normalizedQuery);
    const matchesSummary = item.summary.toLowerCase().includes(normalizedQuery);
    const matchesTags = item.tags.some((tag) => tag.toLowerCase().includes(normalizedQuery));
    const matchesContent = item.content.some((line) => line.toLowerCase().includes(normalizedQuery));

    return matchesTitle || matchesSummary || matchesTags || matchesContent;
  });
}
