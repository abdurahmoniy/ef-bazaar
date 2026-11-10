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

export const HELP_CATEGORIES: readonly HelpCategoryMeta[] = [
  {
    id: 'all',
    label: 'Barchasi',
    shortLabel: 'Barchasi',
    description: 'Barcha qo‘llanmalar va maslahatlar',
    iconName: 'LayoutGrid',
  },
  {
    id: 'start',
    label: 'Boshlash',
    shortLabel: 'Boshlash',
    description: 'Ro‘yxatdan o‘tish, profil va Telegram bot',
    iconName: 'Sparkles',
  },
  {
    id: 'safety',
    label: 'Xavfsiz savdo va Garov',
    shortLabel: 'Xavfsizlik',
    description: 'Garov (Escrow) tizimi, adminlar va firibgarlardan himoya',
    iconName: 'ShieldCheck',
  },
  {
    id: 'buyer',
    label: 'Xaridor qo‘llanmasi',
    shortLabel: 'Xaridor',
    description: 'Akkount qidirish, yulduz kartalar va chat',
    iconName: 'ShoppingBag',
  },
  {
    id: 'seller',
    label: 'Sotuvchi qo‘llanmasi',
    shortLabel: 'Sotuvchi',
    description: 'E‘lon berish, narxlash va obmen',
    iconName: 'UploadCloud',
  },
  {
    id: 'wallet',
    label: 'Hamyon va To‘lovlar',
    shortLabel: 'Hamyon',
    description: 'Balans to‘ldirish, yechib olish va komissiyalar',
    iconName: 'Wallet',
  },
  {
    id: 'faq',
    label: 'Ko‘p so‘raladigan savollar',
    shortLabel: 'FAQ',
    description: 'Tez-tez beriladigan savollarga aniq javoblar',
    iconName: 'HelpCircle',
  },
] as const;

export const HELP_ITEMS: readonly HelpItem[] = [
  // Boshlash (Getting Started)
  {
    id: 'how-to-login',
    category: 'start',
    title: 'Platformaga qanday kirish mumkin?',
    summary: 'efBazaar tizimiga Telegram orqali 1-sekundda yoki Google hisobingiz orqali parolsiz kirishingiz mumkin.',
    content: [
      'Telegram orqali kirish: "Kirish" tugmasini bosing va Telegram widgeti orqali tasdiqlang. Hech qanday parol o‘ylab topish yoki eslab qolish shart emas.',
      'Telegram Mini App: Agar siz platformani Telegram bot ichidagi WebApp orqali ochsangiz, avtomatik ravishda profilingizga kirasiz.',
      'Google hisobini ulash: Profilingiz sozlamalaridan Google hisobingizni ham ulab qo‘yishingiz mumkin. Bu profilingizga "Tasdiqlangan" belgisini beradi va xaridorlar ishonchini oshiradi.',
    ],
    tags: ['login', 'kirish', 'telegram', 'google', 'profil', 'avtorizatsiya'],
    featured: true,
    actionUrl: '/auth/login',
    actionLabel: 'Tizimga kirish',
  },
  {
    id: 'gamer-card-setup',
    category: 'start',
    title: 'Gamer Card nima va uni qanday yaratish kerak?',
    summary: 'Gamer Card — eFootball profilingiz: platformangiz, o‘zingiz haqingizda qisqacha matn va turnir natijalaringiz.',
    content: [
      'Profilingizdagi Gamer Card bo‘limida o‘yin platformasini (Android, iOS yoki ikkalasi) tanlang va o‘zingiz haqingizda qisqacha yozing.',
      'Turnir statistikasi efBazaar turnirlarida qatnashganingizda avtomatik qo‘shiladi.',
      'Karta tayyor bo‘lgach, uni Telegram yoki ijtimoiy tarmoqlarda do‘stlaringiz bilan rasm sifatida ulashishingiz mumkin.',
    ],
    tags: ['gamer card', 'profil', 'reputatsiya', 'diviziyon', 'karta'],
    actionUrl: '/profile',
    actionLabel: 'Profilga o‘tish',
  },
  {
    id: 'telegram-bot-benefits',
    category: 'start',
    title: 'Telegram bot nima uchun kerak?',
    summary: 'Rasmiy Telegram bot sizga yangi chat xabarlari, e‘lonlaringizga bo‘lgan qiziqishlar va bitim holatlari haqida darhol xabar yuboradi.',
    content: [
      'Botga start bosing va efBazaar hisobingizni bog‘lang.',
      'Xaridor sizning e‘loningiz bo‘yicha chat ochsa yoki yangi xabar yozsa, bot sizga lahzali bildirishnoma (push) yuboradi.',
      'Garov (Escrow) bitimlari bo‘yicha har bir qadam: to‘lov qilingani, admin qo‘shilgani va tasdiqlar bot orqali bildiriladi.',
    ],
    tags: ['bot', 'telegram bot', 'bildirishnoma', 'xabarlar', 'notification'],
  },

  {
    id: 'why-link-telegram-google',
    category: 'start',
    title: 'Nega Telegram va Google hisoblarini ulash kerak?',
    summary: 'Google hisobini ulagan foydalanuvchi profilida "Tasdiqlangan" belgisi chiqadi, Telegram esa chat va bildirishnomalar uchun kerak.',
    content: [
      'Tasdiqlangan belgisi: Google hisobini ulasangiz, profilingizda "Tasdiqlangan" belgisi chiqadi va xaridor uni ko‘radi.',
      'Akkount xavfsizligi: Agar bitta kirish usulingiz (masalan Telegram sessiyasi) uzilsa, Google orqali balansingiz va e‘lonlaringizga osonlikcha qayta kira olasiz.',
      'Telegram majburiy: Sotuvchi bilan chat ochish uchun Telegram hisobingiz ulangan bo‘lishi kerak. Shunda yangi xabar, taklif va savdo qadamlari haqida darhol xabar olasiz.',
    ],
    tags: ['tasdiqlangan', 'verified', 'google', 'telegram', 'ishonch', 'profil', 'xavfsizlik'],
    featured: true,
    actionUrl: '/profile',
    actionLabel: 'Hisoblarni ulash',
  },
  {
    id: '100-percent-secure-trade-guarantee',
    category: 'safety',
    title: 'Garov sizni qanday himoya qiladi?',
    summary: 'efBazaar Garov (Escrow) tizimida pul ham, akkount ham xaridor tasdiqlamaguncha hech kimga o‘tmaydi.',
    content: [
      'Muzlatilgan to‘lov: Savdo boshlanganda narx xaridor hamyonida muzlatiladi. Sotuvchi pul platformada turganini ko‘rib akkountni topshiradi.',
      'Sotuvchi uchun kafolat: Xaridor akkountni olib pul to‘lamay ketishi mumkin emas. Pul faqat xaridor tasdiqlaganda o‘tadi, rad etilgan yoki muddati o‘tgan savdoda esa pochta sotuvchiga qaytadi — shunda Konami parolini darhol almashtiring.',
      'Xaridor uchun kafolat: Akkount e‘londagidek bo‘lmasa yoki sotuvchi qadamni muddatida bajarmasa, muzlatilgan pul xaridorga to‘liq qaytadi, komissiya olinmaydi.',
      'Tasdiq qaytarilmaydi: Xaridor tasdiqlagan zahoti pul sotuvchiga o‘tadi va buni ortga qaytarib bo‘lmaydi. Akkountni to‘liq tekshirib, keyin tasdiqlang.',
      'Kelishmovchilik bo‘lsa, "Nizo qoidalari" bo‘yicha qo‘llab-quvvatlash xizmatiga murojaat qiling.',
    ],
    tags: ['xavfsiz', 'kafolat', 'garov', 'escrow', 'himoya', 'ishonch', 'admin'],
    featured: true,
    actionUrl: '/blacklist',
    actionLabel: 'Xavfsizlik markazi',
  },
  {
    id: 'how-escrow-works',
    category: 'safety',
    title: 'Garov (Xavfsiz bitim) tizimi qanday ishlaydi?',
    summary: 'Pul savdo davomida garovda turadi va sotuvchiga faqat xaridor akkountni tekshirib tasdiqlagandan keyin o‘tadi.',
    content: [
      '1. Taklif: Chatda narx kelishilgach sotuvchi "Garov" orqali savdo taklifini yuboradi, xaridor uni qabul qiladi.',
      '2. Garov: Taklif qabul qilinganda narx xaridor hamyonida muzlatiladi, shuning uchun hamyonda yetarli mablag‘ bo‘lishi kerak.',
      '3. Pochta: Sotuvchi 30 daqiqa ichida akkount emailini efBazaar bergan pochtaga o‘zgartiradi va tizim Konami bog‘lanishini tekshiradi.',
      '4. Parol: Sotuvchi parolni bir martalik xabar bilan yuboradi, xaridor uni bir marta ochadi.',
      '5. Tekshiruv: Xaridorga 24 soat beriladi. Tekshiruv paytida akkountda hech narsani o‘zgartirmang — faqat ko‘ring.',
      '6. Natija: "Tasdiqlash" — pul sotuvchiga, pochta va akkount xaridorga o‘tadi, shundan keyin parolni almashtiring. "Rad etish" yoki 24 soat javob bermaslik — pul xaridorga to‘liq qaytadi.',
      'Biror qadam muddatida bajarilmasa, savdo bekor bo‘ladi va pul komissiyasiz qaytadi.',
    ],
    tags: ['garov', 'escrow', 'xavfsiz savdo', 'trade', 'admin', 'bitim', 'kafolat'],
    featured: true,
    actionUrl: '/blacklist',
    actionLabel: 'Xavfsizlik sahifasi',
  },
  {
    id: DISPUTE_RULES_ID,
    category: 'safety',
    title: 'Nizo qoidalari',
    summary: 'Savdoda kelishmovchilik chiqsa nima qilish, qanday dalil kerak va qoidabuzarlikka qanday jazo beriladi.',
    content: [
      'Tekshiruvdagi muammo: Akkount e‘londagidek bo‘lmasa, 24 soat ichida "Rad etish" tugmasini bosing. Pul avtomatik va to‘liq qaytadi, admin kerak emas.',
      'Admin qachon aralashadi: rad etilgan savdo bo‘yicha kelishmovchilik, sotuvchi tasdiqlangan akkountni qaytarib olgani, e‘londa yashirilgan jiddiy kamchilik yoki to‘lovni platformadan tashqarida talab qilish. Murojaat — e‘londagi "Shikoyat" tugmasi yoki qo‘llab-quvvatlash chati.',
      'Dalillar: efBazaar chatidagi yozishmalar (o‘chirilmaydi, admin ko‘ra oladi), e‘lon matni va rasmlari, akkount ichidan vaqt ko‘rinib turgan skrinshot yoki ekran yozuvi, Konami ID. Tekshiruvni ekranga yozib olish tavsiya qilinadi.',
      'Taqiqlanadi: tekshiruv paytida akkountda biror narsani o‘zgartirish (coin sarflash, o‘yinchi sotish, akkount bog‘lash), sotilgan akkountni qaytarib olish, e‘londa bog‘langan akkountni yashirish, soxta skrinshot va chatda savdoni garovsiz davom ettirishni taklif qilish.',
      'Himoyalanmaydi: Telegramda yoki boshqa joyda kelishilgan savdo, Konami akkountni keyinchalik bloklashi va e‘londa ochiq ko‘rsatilgan Google Play / Game Center bog‘lanishi.',
      'Jazo tasdiqlangan shikoyatlar soniga qarab: 1 — ogohlantirish, 3 — 7 kunlik blok, 5 — doimiy blok va ochiq qora ro‘yxat. Asossiz shikoyat yuborganlar ham ogohlantiriladi.',
    ],
    tags: ['nizo', 'shikoyat', 'qoidalar', 'rad etish', 'dalil', 'qora royxat', 'garov'],
    featured: true,
    actionUrl: '/support',
    actionLabel: 'Qo‘llab-quvvatlash',
  },
  {
    id: 'scam-prevention-rules',
    category: 'safety',
    title: 'Firibgarlardan saqlanishning oltin qoidalari',
    summary: 'Hech qachon shaxsiy chatda pul o‘tkazmang yoki tekshirmasdan parollaringizni bermang.',
    content: [
      '❌ Hech qachon to‘g‘ridan-to‘g‘ri karta raqamiga (P2P) oldindan pul tashlamang — faqat efBazaar Garov tizimidan foydalaning.',
      '❌ Shaxsiy parollarni yoki Telegram/Email tasdiqlash kodlarini begona shaxslarga ochiq chatda yozmang.',
      '✅ Har qanday savdo oldidan sotuvchi yoki xaridorning foydalanuvchi profilini va Qora ro‘yxatni (Blacklist) tekshiring.',
      '✅ Agar shubhali holat sezilsa, darhol e‘londagi "Shikoyat" tugmasini bosing yoki qo‘llab-quvvatlash xizmatiga murojaat qiling.',
    ],
    tags: ['firibgar', 'scam', 'ogohlantirish', 'xavfsizlik', 'parol', 'qora royxat'],
    featured: true,
    actionUrl: '/blacklist',
    actionLabel: 'Qora ro‘yxatni ko‘rish',
  },
  {
    id: 'konami-id-transfer-guide',
    category: 'safety',
    title: 'Konami ID va Pochta almashtirish qoidalari',
    summary: 'Garovli savdoda sotuvchi Konami ID emailini efBazaar bergan pochtaga o‘zgartiradi, xaridor tasdiqlagach pochta unga o‘tadi.',
    content: [
      '1. Sotuvchi my.konami.net rasmiy saytida akkountga kiradi.',
      '2. Email bo‘limida savdo panelida ko‘rsatilgan efBazaar pochtasini kiritadi.',
      '3. Shu pochtaga kelgan tasdiqlash kodi savdo panelida ko‘rinadi — uni Konami saytiga kiritadi.',
      '4. Xaridor tasdiqlagach pochta unga o‘tadi: shundan keyin Konami parolini almashtiring.',
      '5. Google Play yoki Game Center bog‘lanishini olib tashlab bo‘lmaydi: Konami ID o‘tadi, bog‘lanish esa eski egada qoladi. Shuning uchun bog‘langan akkount e‘londa ko‘rsatilishi shart va xaridor bu xavfni bilib oladi.',
    ],
    tags: ['konami', 'email', 'pochta', 'parol', 'transfer', '2fa'],
  },

  // Xaridor (Buyer's Guide)
  {
    id: 'how-to-find-accounts',
    category: 'buyer',
    title: 'Kerakli o‘yinchilar bo‘yicha akkountni qanday topish mumkin?',
    summary: 'efBazaar qidiruv tizimi yulduz kartalar (Epic, Big Time, Show Time), diviziyon, platforma va narx bo‘yicha saralash imkonini beradi.',
    content: [
      'Filtrlar tugmasini bosing va o‘zingiz qidirayotgan yulduz kartani (masalan Messi Epic, Ronaldo Show Time, Neymar) tanlang.',
      'Platformani tanlang: Mobil, Steam yoki PlayStation. Mobilda Android va iOS tangalari hamda bog‘langan akkountlar bo‘yicha ham saralash mumkin; Android tangalari faqat Androidda, iOS tangalari faqat iOSda ko‘rinadi.',
      'Diviziyon va jamoa kuchini belgilang — masalan D1 va 3100+ kuch.',
      'Sizga yoqqan e‘lonlarni "Yurakcha" tugmasi orqali Sevimlilar ro‘yxatiga saqlab qo‘yishingiz mumkin.',
    ],
    tags: ['qidiruv', 'filtr', 'epic', 'show time', 'big time', 'messi', 'ronaldo', 'd1'],
    featured: true,
    actionUrl: '/marketplace',
    actionLabel: 'Bozorga o‘tish',
  },
  {
    id: 'buyer-seller-chat-rules',
    category: 'buyer',
    title: 'Sotuvchi bilan qanday bog‘lanish va savdolashish mumkin?',
    summary: 'Har bir e‘lon sahifasida "Sotuvchi bilan bog‘lanish" tugmasi bor. Bir sotuvchi bilan bitta doimiy chat bo‘ladi.',
    content: [
      'E‘lon sahifasidagi "Sotuvchi bilan bog‘lanish" tugmasini bosing — sotuvchi bilan chat ochiladi. Buning uchun Telegram hisobingiz ulangan bo‘lishi kerak.',
      'Narx kelishuvli bo‘lsa, sotuvchiga o‘z narxingizni taklif qiling.',
      'Chat yopilmaydi: shu sotuvchining boshqa akkountlari bo‘yicha suhbat ham shu chatda davom etadi. Keraklisini "Muhim" deb belgilab qo‘yishingiz mumkin.',
      'Telegram username, havola va telefon raqam chatda avtomatik yashiriladi: platformadan tashqaridagi savdo garov bilan himoyalanmaydi.',
      'Kelishuvga erishilgach, savdoni chat ichidagi Garov orqali boshlang.',
    ],
    tags: ['chat', 'boglanish', 'savdolashish', 'obmen', 'xabar'],
  },

  // Sotuvchi (Seller's Guide)
  {
    id: 'how-to-create-listing',
    category: 'seller',
    title: 'E‘lonni qanday to‘g‘ri joylashtirish kerak?',
    summary: 'To‘liq ma‘lumot va aniq skrinshotlar xaridorga akkountni savdodan oldin baholashga yordam beradi.',
    content: [
      '1. "Akkount joylash" yoki "+" tugmasini bosing.',
      '2. Asosiy ko‘rsatkichlarni kiriting: Diviziyon (D1-D4+), Jamoa kuchi (masalan 3150), Android va iOS tangalari miqdori.',
      '3. Yulduz kartalarni tanlang: Akkountingizdagi eng qimmatli Epic, Big Time, Show Time o‘yinchilarni qo‘shing.',
      '4. Platforma ulanishlarini to‘g‘ri ko‘rsating: Google Play yoki Game Center ulanganmi-yo‘qmi belgilang. Bog‘lanishni yashirish firibgarlik hisoblanadi.',
      '5. Narxni kiriting va savdolashish / obmen variantlarini tanlang.',
      '6. Rasmlarni yuklang: Jamoa tarkibi, murabbiy va zaxira o‘yinchilar rasmlarini qo‘shing.',
    ],
    tags: ['elon', 'joylash', 'sotish', 'narx', 'rasm', 'kartalar'],
    featured: true,
    actionUrl: '/marketplace/new',
    actionLabel: 'Akkount joylash',
  },
  {
    id: 'exchange-modes-explained',
    category: 'seller',
    title: 'Obmen (Almashtirish) variantlari qanday ishlaydi?',
    summary: 'efBazaar naqd pul bilan birga akkountni akkountga almashtirishni to‘liq qo‘llab-quvvatlaydi.',
    content: [
      'Faqat sotuv: Belgilangan narxda naqd pulga sotish.',
      'Faqat obmen: Akkountni boshqa akkountga tengma-teng almashtirish. Tavsifda qanday o‘yinchilar yoki tarkib izlayotganingizni yozing.',
      'Obmen + doplata: Agar boshqa akkount biroz kuchsizroq bo‘lsa, ustiga qo‘shimcha to‘lov bilan almashtirish varianti.',
    ],
    tags: ['obmen', 'almashtirish', 'doplata', 'barter', 'shart'],
  },
  {
    id: 'transparent-pricing-commission',
    category: 'seller',
    title: 'Narx belgilash va Komissiya qanday hisoblanadi?',
    summary: 'efBazaar komissiyasi to‘liq shaffof — siz har doim qo‘lingizga tegadigan sof summani oldindan ko‘rasiz.',
    content: [
      'Shaffof xizmat haqi: E‘lon narxini kiritganingizda, tizim avtomatik ravishda xizmat komissiyasini hisoblab chiqaradi va "Sof summa"ni ko‘rsatadi.',
      'Komissiya nima uchun kerak?: Xizmat haqi Garov (Escrow) tizimi orqali to‘lovni xavfsiz muzlatish, akkountni Smart Admin orqali tekshirish va server xavfsizligini ta‘minlashga yo‘naltiriladi.',
      'Yashirin to‘lovlarsiz: efBazaar da hech qanday kutilmagan qo‘shimcha yig‘imlar yo‘q. E‘lon yaratishda ko‘rsatilgan sof summa to‘liq hamyoningizga o‘tkaziladi.',
    ],
    tags: ['narx', 'komissiya', 'sof summa', 'hisob', 'shaffoflik', 'sotuvchi'],
    featured: true,
    actionUrl: '/marketplace/new',
    actionLabel: 'Akkount narxlash',
  },

  // Hamyon va To‘lovlar (Wallet & Payments)
  {
    id: 'how-to-top-up-wallet',
    category: 'wallet',
    title: 'Hamyon balansini qanday to‘ldirish mumkin?',
    summary: 'Hamyonni platforma kartasiga pul o‘tkazib to‘ldirasiz: har to‘ldirish uchun alohida aniq summa beriladi.',
    content: [
      '1. Hamyon sahifasida summani tanlang yoki kiriting.',
      '2. Keyingi qadamda platforma karta raqami va o‘tkaziladigan aniq summa ko‘rsatiladi.',
      '3. Shu aniq summani shu kartaga o‘z bank ilovangizdan o‘tkazing. Boshqa summa o‘tkazilsa, to‘lov avtomatik mos kelmaydi.',
      '4. To‘lov tasdiqlangach balans yangilanadi; tekshirish biroz vaqt olishi mumkin. To‘ldirish so‘rovining muddati cheklangan.',
    ],
    tags: ['hamyon', 'balans', 'toldirish', 'humo', 'karta', 'otkazma'],
    actionUrl: '/hamyon',
    actionLabel: 'Hamyonga o‘tish',
  },
  {
    id: 'how-to-withdraw-funds',
    category: 'wallet',
    title: 'Mablag‘ni kartaga yechib olish qoidalari',
    summary: 'Hamyondagi mablag‘ni bank kartangizga yechib olasiz: so‘rovni admin qo‘lda to‘laydi.',
    content: [
      '1. Hamyon sahifasida "Pul yechish" tugmasini bosing, karta raqami va summani kiriting. Eng kam summa — 10 000 so‘m.',
      '2. So‘rov yaratilganda summa hamyoningizda band qilinadi.',
      '3. Admin pulni kartangizga o‘tkazadi va so‘rovni yopadi. So‘rov rad etilsa, band qilingan summa hamyoningizga qaytadi.',
      '4. Bir vaqtda faqat bitta ochiq so‘rov bo‘lishi mumkin: yangisini avvalgisi yakunlangach yuborasiz.',
    ],
    tags: ['yechib olish', 'pul yechish', 'withdraw', 'karta', 'humo', 'uzcard'],
    actionUrl: '/hamyon',
    actionLabel: 'Pul yechish',
  },

  // FAQ (Frequently Asked Questions)
  {
    id: 'faq-division-meaning',
    category: 'faq',
    title: 'Diviziyon qanday hisoblanadi — D1 yuqorimi yoki D4+?',
    summary: 'eFootball o‘yinida Diviziyon 1 (D1) eng yuqori daraja hisoblanadi.',
    content: [
      'eFootball reyting tizimida D1 — elita liga hisoblanadi.',
      'eFBazaar platformasida 4 ta daraja ishlatiladi: D1 (Eng yuqori), D2 (Yuqori), D3 (O‘rta) va D4+ (Boshlang‘ich daraja).',
    ],
    tags: ['diviziyon', 'd1', 'd2', 'd3', 'd4', 'daraja'],
  },
  {
    id: 'faq-coins-split',
    category: 'faq',
    title: 'Nega Android va iOS tangalari alohida ko‘rsatiladi?',
    summary: 'Konami qoidalariga ko‘ra, Android tangalari iOS qurilmasiga, iOS tangalari esa Androidga o‘tmaydi.',
    content: [
      'Agar akkountda 5000 Android tangasi bo‘lsa, uni iPhone orqali ochsangiz bu tangalar ko‘rinmaydi (ammo Androidda saqlanib turadi).',
      'Shu sababli har bir e‘londa Android Coins va iOS Coins alohida ko‘rsatiladi.',
      'Akkount sotib olayotganda o‘zingiz ishlatadigan telefon tizimiga (Android yoki iOS) e‘tibor bering.',
    ],
    tags: ['tangalar', 'coins', 'android', 'ios', 'konami'],
  },
  {
    id: 'faq-support-contact',
    category: 'faq',
    title: 'Qo‘llab-quvvatlash xizmati bilan qanday bog‘lanish mumkin?',
    summary: 'Savol yoki nizo bo‘lsa, saytdagi qo‘llab-quvvatlash chatiga yozing.',
    content: [
      'Qo‘llab-quvvatlash sahifasida admin bilan chat ochiladi.',
      'Savdo yoki e‘lon haqida yozsangiz, uning havolasini ilova qiling — masala tezroq hal bo‘ladi.',
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
