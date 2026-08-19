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
    summary: 'Gamer Card — bu sizning eFootball reputatsiyangiz, diviziyoningiz va sevimli sxemangizni ko‘rsatuvchi raqamli kartangiz.',
    content: [
      'Gamer Card orqali boshqa o‘yinchilar sizning diviziyoningiz, o‘yin uslubingiz va platformangizni (Android/iOS) ko‘ra oladi.',
      'Gamer Card yaratish uchun profilingizga o‘ting, o‘yin taxallusingiz, Konami ID (ixtiyoriy) va yutuqlaringizni kiriting.',
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
    summary: 'Ikkala hisobni ulagan foydalanuvchilar "Tasdiqlangan" belgisini oladi va xaridorlar ularga 3 barobar ko‘proq ishonadi.',
    content: [
      'Xaridorlar ishonchi: efBazaar statistikasi bo‘yicha, tasdiqlangan (Verified) sotuvchilar e‘lonlari 2-3 barobar tezroq sotiladi va xaridorlar ularga bexavotir murojaat qilishadi.',
      'Akkount xavfsizligi: Agar bitta kirish usulingiz (masalan Telegram sessiyasi) uzilsa, Google orqali balansingiz va e‘lonlaringizga osonlikcha qayta kira olasiz.',
      'Tezkor bildirishnomalar: Telegram ulanganda e‘loningizga layk bosilgani, yangi chat ochilgani yoki taklif kelgani haqida darhol xabar olasiz.',
    ],
    tags: ['tasdiqlangan', 'verified', 'google', 'telegram', 'ishonch', 'profil', 'xavfsizlik'],
    featured: true,
    actionUrl: '/profile',
    actionLabel: 'Hisoblarni ulash',
  },
  {
    id: '100-percent-secure-trade-guarantee',
    category: 'safety',
    title: '100% Xavfsiz va Kafolatlangan Bitim qanday ishlaydi?',
    summary: 'efBazaar Garov (Escrow) tizimida xaridor va sotuvchi 100% himoyalangan — hech bir tomon aldanib qolmaydi.',
    content: [
      '100% Muzlatilgan Depozit: Xaridor to‘lov qilganda, pul sotuvchiga emas, platforma depozitiga muzlatiladi. Sotuvchi pul platformada xavfsiz turganini ko‘rib akkountni topshiradi.',
      'Sotuvchi uchun kafolat: Sotuvchi akkountni topshirib, ma‘lumotlar to‘liq o‘tgach xaridor tasdiqlaydi va pul darhol sotuvchining hamyoniga o‘tadi. Xaridor akkountni olib pul to‘lamay ketishi mutlaqo imkonsiz.',
      'Xaridor uchun kafolat: Agar sotuvchi noto‘g‘ri parol bersa yoki shartlarni bajarmasa, muzlatilgan pul 100% to‘liq xaridorning hamyoniga qaytariladi.',
      'Xolis Adminlar nazorati: Har qanday tushunmovchilikda Smart Admin yoki Inson Admin tekshiruv o‘tkazib nizoni adolatli hal qiladi.',
    ],
    tags: ['100% xavfsiz', 'kafolat', 'garov', 'escrow', 'himoya', 'ishonch', 'admin'],
    featured: true,
    actionUrl: '/blacklist',
    actionLabel: 'Xavfsizlik markazi',
  },
  {
    id: 'how-escrow-works',
    category: 'safety',
    title: 'Garov (Xavfsiz bitim) tizimi qanday ishlaydi?',
    summary: 'Garov tizimi xaridor va sotuvchi o‘rtasidagi bitimni to‘liq xavfsiz qiladi: pul admin kafolatida ushlab turiladi.',
    content: [
      '1. Bitim taklifi: Chat orqali sotuvchi va xaridor narx va shartlarni kelishib, "Garov ochish" tugmasini bosadi.',
      '2. Mablag‘ muzlatilishi: Xaridor to‘lovni efBazaar hamyoniga kiritadi va pul xavfsiz holda depozitga olinadi. Sotuvchi pul platformada saqlanayotganini ko‘radi.',
      '3. Akkount topshirish: Sotuvchi akkount login va parolini beradi (yoki Smart Admin avtomatik tekshiruvdan o‘tkazadi). Xaridor akkountga kirib barcha ma‘lumotlarni o‘zgartiradi.',
      '4. Tasdiqlash: Xaridor akkountni qabul qilib olganini tasdiqlaganidan so‘ng, muzlatilgan pul sotuvchining hamyoniga o‘tkazib beriladi.',
      'Agar muammo chiqsa, Trade Admin aralashib tekshiradi va haqli tomonga mablag‘ni qaytaradi.',
    ],
    tags: ['garov', 'escrow', 'xavfsiz savdo', 'trade', 'admin', 'bitim', 'kafolat'],
    featured: true,
    actionUrl: '/blacklist',
    actionLabel: 'Xavfsizlik sahifasi',
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
      '✅ Agar shubhali holat sezilsa, darhol "Shikoyat qilish" tugmasini bosing yoki qo‘llab-quvvatlash xizmatiga murojaat qiling.',
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
    summary: 'eFootball akkountini to‘liq o‘tkazish uchun Konami ID ga bog‘langan elektron pochtani to‘g‘ri o‘zgartirish shart.',
    content: [
      '1. my.konami.net rasmiy saytiga kiring va akkountga kiring.',
      '2. "Email Address" bo‘limiga o‘ting va xaridorning yangi elektron pochtasini kiriting.',
      '3. Yangi pochtaga kelgan 6 xonali tasdiqlash kodini kiriting.',
      '4. Parolni yangilang va ikki bosqichli himoyani (2FA) yoqing.',
      '5. Agar Google Play yoki Game Center ulangan bo‘lsa, ulanishlarni uzish yoki yangi egasiga to‘liq topshirish kerakligini inobatga oling.',
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
      'Platformani tanlang: Android (Google Play) yoki iOS (Game Center). E‘tibor bering, Android tangalari faqat Androidda, iOS tangalari faqat iOSda ko‘rinadi.',
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
    summary: 'Har bir e‘lon sahifasida "Egasi bilan bog‘lanish" tugmasi mavjud. Chat 24 soat davomida faol bo‘ladi.',
    content: [
      'E‘lon sahifasidagi "Egasi bilan bog‘lanish" tugmasini bosing — avtomatik tarzda xavfsiz chat xonasi ochiladi.',
      'Agar e‘londa "Savdolashish mumkin" belgisi bo‘lsa, sotuvchiga o‘z narxingizni taklif qiling.',
      'Chat 24 soat harakatsizlikdan so‘ng avtomatik yopiladi. Agar kelishuv davom etayotgan bo‘lsa, chatni "Muhim" deb belgilab qo‘ying.',
      'Kelishuvga erishilgach, chat ichidan to‘g‘ridan-to‘g‘ri Garov (Escrow) oching.',
    ],
    tags: ['chat', 'boglanish', 'savdolashish', 'obmen', 'xabar'],
  },

  // Sotuvchi (Seller's Guide)
  {
    id: 'how-to-create-listing',
    category: 'seller',
    title: 'E‘lonni qanday to‘g‘ri joylashtirish kerak?',
    summary: 'To‘liq ma‘lumotli va sifatli skrinshotlarga ega e‘lonlar 3-5 barobar tezroq sotiladi.',
    content: [
      '1. "Akkount joylash" yoki "+" tugmasini bosing.',
      '2. Asosiy ko‘rsatkichlarni kiriting: Diviziyon (D1-D4+), Jamoa kuchi (masalan 3150), Android va iOS tangalari miqdori.',
      '3. Yulduz kartalarni tanlang: Akkountingizdagi eng qimmatli Epic, Big Time, Show Time o‘yinchilarni qo‘shing (12 tagacha).',
      '4. Platforma ulanishlarini to‘g‘ri ko‘rsating: Google Play yoki Game Center ulanganmi-yo‘qmi belgilang.',
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
    summary: 'efBazaar hamyonini Uzcard, Humo va bank kartalari orqali xavfsiz to‘ldirishingiz mumkin.',
    content: [
      '1. Hamyon sahifasiga o‘ting va "Balansni to‘ldirish" tugmasini bosing.',
      '2. Kerakli summani kiriting (minimal to‘ldirish: 5 000 so‘m).',
      '3. To‘lov tizimi orqali kartangiz ma‘lumotlarini kiriting va SMS-kod bilan tasdiqlang.',
      '4. To‘lov amalga oshirilishi bilan mablag‘ soniyalar ichida balansingizda aks etadi.',
    ],
    tags: ['hamyon', 'balans', 'toldirish', 'uzcard', 'humo', 'kartalar'],
    actionUrl: '/hamyon',
    actionLabel: 'Hamyonga o‘tish',
  },
  {
    id: 'how-to-withdraw-funds',
    category: 'wallet',
    title: 'Mablag‘ni kartaga yechib olish qoidalari',
    summary: 'Sotilgan akkount pullarini istalgan o‘zbekistonlik bank kartasiga (Uzcard/Humo) yechib olishingiz mumkin.',
    content: [
      '1. Hamyon sahifasida "Pul yechish" tugmasini bosing.',
      '2. Mablag‘ o‘tkaziladigan karta raqami va summani kiriting.',
      '3. So‘rov adminlar tomonidan tekshiriladi va odatda 15-60 daqiqa ichida kartangizga tushirib beriladi.',
      '4. Xavfsizlik maqsadida faqat tasdiqlangan va yakunlangan bitimlardan tushgan mablag‘lar yechib olinadi.',
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
    summary: 'Savollar yoki nizoli vaziyatlar yuzaga kelsa, rasmiy Telegram qo‘llab-quvvatlash administratoriga murojaat qiling.',
    content: [
      'Rasmiy Telegram qo‘llab-quvvatlash boti yoki adminiga to‘g‘ridan-to‘g‘ri murojaat qilishingiz mumkin.',
      'Har doim e‘lon ID raqamini yoki bitim ID sini xabarga ilova qiling, bu masalani tezroq hal qilishga yordam beradi.',
    ],
    tags: ['yordam', 'support', 'admin', 'telegram', 'aloqa', 'murojaat'],
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
