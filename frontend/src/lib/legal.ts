import { DISPUTE_RULES_HREF } from './help-data';

/**
 * Oferta va maxfiylik siyosatining joriy versiyasi. Matn mazmunan o'zgarsa
 * shu sanani yangilang: auth-service saqlagan versiya bundan farq qilsa,
 * foydalanuvchidan rozilik qayta so'raladi (TermsConsentGate).
 */
export const TERMS_VERSION = '2026-11-10';

export const OFERTA_HREF = '/oferta';
export const PRIVACY_HREF = '/maxfiylik';

/** Kirgan foydalanuvchi joriy versiyaga hali rozi bo'lmaganmi. */
export function needsTermsConsent(user: { termsVersion?: string | null }): boolean {
  return user.termsVersion !== TERMS_VERSION;
}

export interface LegalLink {
  label: string;
  href: string;
}

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  links?: LegalLink[];
}

export interface LegalDocument {
  href: string;
  title: string;
  intro: string;
  sections: LegalSection[];
}

const SUPPORT_LINK: LegalLink = { label: 'Qo‘llab-quvvatlash', href: '/support' };

const OFERTA: LegalDocument = {
  href: OFERTA_HREF,
  title: 'Ommaviy oferta (foydalanuvchi shartnomasi)',
  intro:
    'Bu shartnoma efBazaar platformasidan (efbazaar.uz sayti, Telegram bot va Mini App) foydalanish shartlarini belgilaydi. Platformaga kirib, shu shartlarga rozilik bildirasiz.',
  sections: [
    {
      heading: '1. Platforma nima qiladi',
      paragraphs: [
        'efBazaar — eFootball akkountlarini sotish, sotib olish va almashish uchun e‘lonlar maydoni hamda garov (escrow) xizmati. Akkountlar platformaga emas, ularni joylagan foydalanuvchilarga tegishli.',
        'efBazaar Konami bilan bog‘liq emas. eFootball, Konami ID va ularning qoidalari Konami tomonidan belgilanadi.',
      ],
    },
    {
      heading: '2. Ro‘yxatdan o‘tish va akkaunt',
      paragraphs: [
        'Platformaga Telegram yoki Google orqali kirasiz. Chat ochish va savdo qilish uchun Telegram ulangan bo‘lishi kerak.',
        'Akkauntingiz orqali qilingan harakatlar uchun o‘zingiz javob berasiz. Akkauntni boshqa odamga berish yoki birovning nomidan ish ko‘rish taqiqlanadi.',
      ],
    },
    {
      heading: '3. E‘lon joylash',
      paragraphs: [
        'Sotuvchi akkount haqida to‘g‘ri ma‘lumot beradi: divizion, jamoa kuchi, tangalar, muhim o‘yinchilar va akkountga ulangan do‘kon havolalari.',
        'Google Play yoki Game Center havolasini akkountdan olib tashlab bo‘lmaydi. Bunday havola bo‘lsa, e‘londa ko‘rsatilishi shart.',
        'O‘zingizga tegishli bo‘lmagan, o‘g‘irlangan yoki boshqa joyda allaqachon sotilgan akkountni joylash taqiqlanadi.',
      ],
    },
    {
      heading: '4. Garov orqali savdo',
      paragraphs: [
        'Xaridor savdo narxini hamyondan to‘laydi va pul garovda muzlatiladi. Sotuvchi akkountni platforma ko‘rsatgan qadamlar bo‘yicha topshiradi; har qadam uchun muddat savdo oynasida ko‘rinadi.',
        'Sotuvchi qadamni muddatida bajarmasa, savdo bekor bo‘ladi va pul xaridorga komissiyasiz qaytadi. Pul garovda turgani uchun xaridor akkountni olib pul to‘lamay ketishi mumkin emas.',
        'Akkountni qabul qilgach, xaridor uni savdo oynasida ko‘rsatilgan muddat ichida tekshiradi va tasdiqlaydi yoki rad etadi. Tekshiruv paytida akkountda hech narsani o‘zgartirmang.',
        'Xaridor tasdiqlagach, pul sotuvchiga o‘tadi va savdo yakunlanadi. Tasdiqlangan savdo bo‘yicha pul qaytarilmaydi, shuning uchun akkountni tasdiqlashdan oldin to‘liq tekshiring.',
        'Platforma komissiyasi e‘lon sahifasida va savdo boshlanishida ko‘rsatiladi va sotuvchiga o‘tadigan summadan ushlab qolinadi.',
      ],
    },
    {
      heading: '5. Hamyon',
      paragraphs: [
        'Hamyon to‘lov sahifasida ko‘rsatilgan aniq summani platforma kartasiga o‘tkazish orqali to‘ldiriladi. Boshqa summa yoki boshqa kartaga o‘tkazilgan pul avtomatik tushmaydi; bunday holda qo‘llab-quvvatlashga yozing.',
        'Pul yechish uchun so‘rov qoldirasiz. Eng kam summa — 10 000 so‘m, bir vaqtda bitta ochiq so‘rov bo‘lishi mumkin. So‘ralgan summa hamyonda band qilinadi va administrator uni qo‘lda kartangizga o‘tkazadi.',
      ],
    },
    {
      heading: '6. Taqiqlangan harakatlar',
      paragraphs: [
        'Platformadan tashqarida to‘lov yoki akkount topshirishni taklif qilish, chatda kontakt almashib garovni chetlab o‘tish.',
        'Firibgarlik: soxta skrinshot yoki dalil, sotilgan akkountni qaytarib olishga urinish, xaridor tekshirayotganda akkount ma‘lumotlarini o‘zgartirish.',
        'Asossiz shikoyatlar, boshqa foydalanuvchilarni haqorat qilish yoki tahdid qilish.',
      ],
    },
    {
      heading: '7. Nizolar va jazolar',
      paragraphs: [
        'Nizolar nizo qoidalari bo‘yicha ko‘rib chiqiladi: qachon rad etish mumkin, qanday dalil qabul qilinadi va qanday jazolar qo‘llanadi.',
        'Tasdiqlangan shikoyatlar uchun ogohlantirish, vaqtinchalik va doimiy blok qo‘llanadi. Doimiy bloklangan foydalanuvchining identifikatorlari ochiq qora ro‘yxatga kiritiladi.',
      ],
      links: [{ label: 'Nizo qoidalari', href: DISPUTE_RULES_HREF }],
    },
    {
      heading: '8. Javobgarlik chegarasi',
      paragraphs: [
        'efBazaar akkountni garov qadamlari bo‘yicha topshirishni ta‘minlaydi. Savdodan keyin Konami tomonidan qo‘llangan bloklash, o‘yin qoidalari yoki o‘yin ichidagi o‘zgarishlar uchun platforma javob bermaydi.',
        'Platformadan tashqarida kelishilgan savdolar va o‘tkazmalar uchun efBazaar javob bermaydi.',
      ],
    },
    {
      heading: '9. Shartlarning o‘zgarishi',
      paragraphs: [
        'Shartnoma yangilansa, yangi versiya shu sahifada e‘lon qilinadi va keyingi kirishingizda rozilik qayta so‘raladi. Rozi bo‘lmasangiz, platformadan foydalanishni to‘xtatib, akkauntni o‘chirishingiz mumkin.',
        'Shartnomaga O‘zbekiston Respublikasi qonunchiligi qo‘llanadi.',
      ],
    },
    {
      heading: '10. Aloqa',
      paragraphs: ['Savol va murojaatlar qo‘llab-quvvatlash sahifasi orqali qabul qilinadi.'],
      links: [SUPPORT_LINK],
    },
  ],
};

const PRIVACY: LegalDocument = {
  href: PRIVACY_HREF,
  title: 'Maxfiylik siyosati',
  intro:
    'Bu siyosat efBazaar qaysi shaxsiy ma‘lumotlarni yig‘ishi, nima uchun ishlatishi va kimga ko‘rsatishini tushuntiradi. Platformaga kirib, ma‘lumotlaringiz shu siyosat bo‘yicha qayta ishlanishiga rozilik bildirasiz.',
  sections: [
    {
      heading: '1. Qanday ma‘lumot yig‘iladi',
      paragraphs: [
        'Telegram orqali kirganda: Telegram ID, username, ism va profil rasmi.',
        'Google orqali kirganda yoki Google ulaganda: Google ID, email va ism.',
        'Platformadagi faoliyat: e‘lonlar, chat xabarlari va yuborilgan fayllar, savdo yozishmalari, shikoyatlar.',
        'Hamyon: to‘ldirish va yechish tarixi, pul yechish uchun kiritilgan karta raqami. Karta raqami shifrlangan holda saqlanadi.',
      ],
    },
    {
      heading: '2. Nima uchun ishlatiladi',
      paragraphs: [
        'Kirish va akkauntni himoyalash, e‘lon va chatlarni ko‘rsatish, garov orqali savdoni bajarish, hamyon operatsiyalari va pul yechish.',
        'Nizolarni ko‘rib chiqish va firibgarlikka qarshi kurash: chat va savdo yozishmalari nizoda dalil sifatida ko‘riladi.',
        'Bildirishnomalar: Telegram bot xabarlari va brauzer push-xabarlari (agar ruxsat bergan bo‘lsangiz).',
      ],
    },
    {
      heading: '3. Kim ko‘radi',
      paragraphs: [
        'Boshqa foydalanuvchilar profilingizdagi ism, rasm va e‘lonlarni ko‘radi.',
        'Doimiy bloklangan foydalanuvchining Konami ID, Telegram ID yoki username va telefon raqami ochiq qora ro‘yxatda ko‘rsatiladi.',
        'Savdoni olib boruvchi administrator va savdo-admin shu savdo yozishmalarini ko‘radi.',
        'Ma‘lumotlaringiz sotilmaydi. Ular faqat xizmat ishlashi uchun kerak bo‘lgan tashqi xizmatlarga beriladi: Telegram (kirish, bot, media fayllar saqlanadi), Google (kirish) va Yandex Metrika (sayt statistikasi).',
      ],
    },
    {
      heading: '4. Cookie va statistika',
      paragraphs: [
        'Kirgan holatingizni saqlash uchun cookie ishlatiladi. Saytdan foydalanish statistikasi Yandex Metrika orqali yig‘iladi.',
      ],
    },
    {
      heading: '5. Saqlash va o‘chirish',
      paragraphs: [
        'Profil sahifasida akkauntni o‘chirish mumkin. O‘chirilganda profil ma‘lumotlari o‘chadi, e‘lonlar va chatlar boshqa xizmatlardan ham tozalanadi.',
        'Moliyaviy operatsiyalar yozuvlari va nizo dalillari qonunchilik talab qiladigan muddatda saqlanishi mumkin.',
      ],
    },
    {
      heading: '6. Huquqlaringiz',
      paragraphs: [
        'Ma‘lumotlaringiz haqida so‘rash, ularni tuzatish yoki o‘chirishni talab qilish uchun qo‘llab-quvvatlashga yozing.',
        'Siyosat yangilansa, yangi versiya shu sahifada e‘lon qilinadi va keyingi kirishingizda rozilik qayta so‘raladi.',
      ],
      links: [SUPPORT_LINK],
    },
  ],
};

export const LEGAL_DOCUMENTS = { oferta: OFERTA, privacy: PRIVACY } as const;
