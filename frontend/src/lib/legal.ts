import { DISPUTE_RULES_HREF } from './help-data';

/**
 * Oferta va maxfiylik siyosatining joriy versiyasi. Matn mazmunan o'zgarsa
 * shu sanani yangilang: auth-service saqlagan versiya bundan farq qilsa,
 * foydalanuvchidan rozilik qayta so'raladi (TermsConsentGate).
 *
 * Atamalar: "akkount" — eFootball o'yin akkounti, "hisob" — efBazaar'dagi
 * foydalanuvchi hisobi. Yordam markazi (help-data.ts) ham shu atamalarni ishlatadi.
 */
export const TERMS_VERSION = '2026-11-11';

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
const DISPUTE_RULES_LINK: LegalLink = { label: 'Nizo qoidalari', href: DISPUTE_RULES_HREF };

const OFERTA: LegalDocument = {
  href: OFERTA_HREF,
  title: 'Ommaviy oferta (foydalanuvchi shartnomasi)',
  intro:
    'Bu shartnoma efBazaar platformasidan (efbazaar.uz sayti, Telegram bot va Mini App) foydalanish shartlarini belgilaydi. Platformaga kirib va «Roziman» tugmasini bosib, shu shartlarni to‘liq qabul qilasiz. Shartlarga rozi bo‘lmasangiz, platformadan foydalanmang.',
  sections: [
    {
      heading: '1. Atamalar',
      paragraphs: [
        'Platforma — efBazaar: efbazaar.uz sayti, Telegram bot va Mini App.',
        'Akkount — eFootball o‘yinidagi akkount (Konami ID). Hisob — sizning efBazaar’dagi foydalanuvchi hisobingiz.',
        'Garov — savdo davomida pulni platformada muzlatib turadigan xizmat: pul sotuvchiga faqat xaridor akkountni tasdiqlagandan keyin o‘tadi.',
        'Hamyon — hisobingizdagi so‘mda yuritiladigan qoldiq. U faqat platformadagi to‘lovlar uchun ishlatiladi; bank hisobvarag‘i yoki omonat emas va unga foiz hisoblanmaydi.',
      ],
    },
    {
      heading: '2. Platforma nima qiladi',
      paragraphs: [
        'efBazaar — eFootball akkountlarini sotish, sotib olish va almashish uchun e‘lonlar maydoni hamda garov xizmati. Akkountlar platformaga emas, ularni joylagan foydalanuvchilarga tegishli. Platforma savdoning tomoni emas: u sotuvchi va xaridorni bog‘laydi va savdo qadamlarini ta‘minlaydi.',
        'efBazaar Konami bilan bog‘liq emas. eFootball, Konami ID va ularning qoidalari Konami tomonidan belgilanadi. Akkountni boshqa shaxsga berish Konami qoidalariga zid bo‘lishi mumkin; bu xavfni bilasiz va uni o‘z zimmangizga olasiz.',
        'Platforma e‘londagi ma‘lumot to‘g‘riligini, akkountning Konami qoidalariga mosligini va u kelajakda bloklanmasligini kafolatlamaydi.',
      ],
    },
    {
      heading: '3. Kim foydalanishi mumkin',
      paragraphs: [
        'Platformaga Telegram yoki Google orqali kirasiz. Chat ochish va savdo qilish uchun Telegram ulangan bo‘lishi kerak. Kirish uchun platformaning rasmiy Telegram kanaliga a‘zo bo‘lish talab qilinishi mumkin.',
        'Bir kishi bitta hisobdan foydalanadi. Hisobingiz orqali qilingan harakatlar uchun o‘zingiz javob berasiz. Hisobni boshqa odamga berish yoki birovning nomidan ish ko‘rish taqiqlanadi.',
      ],
    },
    {
      heading: '4. E‘lon joylash',
      paragraphs: [
        'Sotuvchi akkount haqida to‘g‘ri ma‘lumot beradi: divizion, jamoa kuchi, tangalar, muhim o‘yinchilar va akkountga bog‘langan Google Play yoki Game Center.',
        'Google Play yoki Game Center bog‘lanishini akkountdan olib tashlab bo‘lmaydi. Bunday bog‘lanish bo‘lsa, e‘londa ko‘rsatilishi shart; uni yashirish firibgarlik hisoblanadi.',
        'O‘zingizga tegishli bo‘lmagan, o‘g‘irlangan yoki boshqa joyda allaqachon sotilgan akkountni joylash taqiqlanadi.',
        'E‘longa joylagan matn va rasmlaringizni platforma saytda, botda va rasmiy kanallarda ko‘rsatishi mumkin. Qoidalarga zid e‘lonni platforma ogohlantirishsiz yashirishi yoki o‘chirishi mumkin.',
      ],
    },
    {
      heading: '5. Garov orqali savdo',
      paragraphs: [
        'Savdo chatdagi taklifdan boshlanadi: uni sotuvchi ham, xaridor ham yuborishi mumkin, ikkinchi tomon esa qabul qiladi. Taklif qabul qilingan zahoti savdo summasi xaridor hamyonida muzlatiladi, shuning uchun hamyonda yetarli mablag‘ bo‘lishi kerak.',
        'Sotuvchi akkountni platforma ko‘rsatgan qadamlar bo‘yicha topshiradi: akkount emailini platforma bergan pochta qutisiga o‘zgartiradi va parolni bir martalik xabar bilan yuboradi. Har qadamning muddati savdo oynasida ko‘rinadi.',
        'Sotuvchi qadamni muddatida bajarmasa yoki savdo platformadagi texnik sabab bilan uzilsa, savdo bekor bo‘ladi va muzlatilgan pul xaridorga to‘liq qaytadi, komissiya olinmaydi. Pul garovda turgani uchun xaridor akkountni olib pul to‘lamay ketishi mumkin emas.',
        'Akkountni qabul qilgach, xaridor uni savdo oynasida ko‘rsatilgan muddat ichida tekshiradi va tasdiqlaydi yoki rad etadi. Shu muddatda javob bermasa, savdo rad etilgan hisoblanadi va pul unga qaytadi. Tekshiruv paytida akkountda hech narsani o‘zgartirmang.',
        'Savdo rad etilsa yoki bekor bo‘lsa, pochta qutisi sotuvchiga qaytadi. Sotuvchi shundan keyin darhol Konami parolini almashtirishi kerak.',
        'Xaridor tasdiqlagach, pul sotuvchiga o‘tadi va savdo yakunlanadi. Tasdiqlangan savdo bo‘yicha pul qaytarilmaydi, shuning uchun akkountni tasdiqlashdan oldin to‘liq tekshiring.',
        'Sotuvda platforma komissiyasi sotuvchiga o‘tadigan summadan ushlab qolinadi. Komissiya miqdori e‘lon sahifasida va savdo boshlanishida ko‘rsatiladi. Stavka o‘zgarishi mumkin; boshlangan savdoga u ochilgan paytdagi shart qo‘llanadi.',
      ],
    },
    {
      heading: '6. Almashish savdosi',
      paragraphs: [
        'Akkountni akkountga almashtirish ham garov orqali o‘tadi: har ikki tomon o‘z akkountini alohida pochta qutisi orqali topshiradi. Ustama to‘lov kelishilgan bo‘lsa, u to‘laydigan tomonning hamyonida muzlatiladi.',
        'Almashishda xizmat haqini kim to‘lashi taklifda belgilanadi: bir tomon yoki ikkalasi teng. Har tomonning hamyonidan muzlatiladigan summa taklifni qabul qilishdan oldin ko‘rsatiladi.',
        'Bir tomon o‘z qadamini bajarmasa, savdo bekor bo‘ladi, muzlatilgan summalar va pochta qutilari egalariga qaytadi.',
      ],
    },
    {
      heading: '7. Pochta qutilari',
      paragraphs: [
        'Savdo uchun platforma o‘z domenida pochta qutisi ochadi. Savdo tasdiqlangach quti xaridorga o‘tadi va u xatlarni platformaning pochta sahifasida o‘qiydi.',
        'Savdo qadamlarini bajarish uchun platforma shu qutiga Konami’dan kelgan xatlarni avtomatik o‘qiydi: tasdiqlash kodlari va parolni tiklash xatlari. Quti platforma serverida joylashgan, shuning uchun platforma unga texnik kirish imkoniga ega.',
        'Bir hisobdagi qutilar soni tarifga bog‘liq. Pullik tarif muddati tugasa, limitdan ortiq qutilar yana 30 kun to‘liq ochiq turadi, keyin ularda faqat Konami’ning akkountni tiklash va xavfsizlik xatlari ko‘rinadi.',
        'Faol savdo yoki nizo bo‘lmasa, akkount emailini o‘z shaxsiy manzilingizga ko‘chirishingiz mumkin. Platforma tashqi xizmatlardan keladigan xatlarning yetib kelishini kafolatlamaydi.',
      ],
    },
    {
      heading: '8. Hamyon',
      paragraphs: [
        'Hamyon to‘lov sahifasida ko‘rsatilgan aniq summani platforma kartasiga o‘tkazish orqali to‘ldiriladi. Eng kam summa — 1 000 so‘m. To‘ldirish so‘rovi 15 daqiqa amal qiladi; to‘lovni ajratib olish uchun ko‘rsatilgan summa siz kiritgan summadan bir oz farq qilishi mumkin.',
        'Boshqa summa, boshqa karta yoki muddati o‘tgan so‘rov bo‘yicha o‘tkazilgan pul avtomatik tushmaydi. Bunday holda to‘lov chekini qo‘llab-quvvatlashga yuboring — to‘lov qo‘lda tekshiriladi. To‘lovlarni tekshirish tizimi vaqtincha ishlamasa, to‘ldirish qabul qilinmasligi mumkin.',
        'Pul yechish uchun so‘rov qoldirasiz. Eng kam summa — 10 000 so‘m, bir vaqtda bitta ochiq so‘rov bo‘lishi mumkin. So‘ralgan summa hamyonda band qilinadi va administrator uni qo‘lda kartangizga o‘tkazadi. So‘rovlar navbat bilan ko‘rib chiqiladi; so‘rov rad etilsa, band qilingan summa hamyonga qaytadi.',
        'Karta raqami yoki karta egasining ismini noto‘g‘ri kiritganingiz oqibatida boshqa shaxsga o‘tgan pul uchun platforma javob bermaydi. Hamyonga xato yoki asossiz tushgan summani platforma tuzatishi mumkin.',
      ],
    },
    {
      heading: '9. Pullik tarif',
      paragraphs: [
        'Pro tarifi qo‘shimcha imkoniyatlar beradi; ularning ro‘yxati va narxi tariflar sahifasida ko‘rsatiladi. To‘lov hamyondan, xaridni tasdiqlaganingizdan keyin yechiladi.',
        'Tarif tanlangan muddatga yoqiladi va o‘zi uzaymaydi: muddat tugashi haqida eslatma yuboriladi, uzaytirishni o‘zingiz qilasiz. Narx o‘zgarishi mumkin; to‘langan muddatga yangi narx ta‘sir qilmaydi.',
        'Tarif uchun to‘langan pul qaytarilmaydi. Muddat tugagach pullik imkoniyatlar o‘chadi, lekin saqlangan ma‘lumotlaringiz o‘chirilmaydi.',
      ],
      links: [{ label: 'Tariflar', href: '/plans' }],
    },
    {
      heading: '10. Chat qoidalari',
      paragraphs: [
        'Chat faqat akkount savdosi bo‘yicha muloqot uchun. Telegram username, havola va telefon raqam chatda avtomatik yashiriladi.',
        'Chat yozishmalari saqlanadi. Shikoyat yoki nizo bo‘lganda administrator ularni ko‘rib chiqadi va dalil sifatida ishlatadi.',
      ],
    },
    {
      heading: '11. Taqiqlangan harakatlar',
      paragraphs: [
        'Platformadan tashqarida to‘lov yoki akkount topshirishni taklif qilish, chatda kontakt almashib garovni chetlab o‘tish.',
        'Firibgarlik: soxta skrinshot yoki dalil, sotilgan akkountni qaytarib olishga urinish, xaridor tekshirayotganda akkount ma‘lumotlarini o‘zgartirish, e‘londa bog‘langan Google Play yoki Game Center’ni yashirish.',
        'Asossiz shikoyatlar, boshqa foydalanuvchilarni haqorat qilish yoki tahdid qilish.',
        'Platforma ishiga xalaqit berish: avtomatik so‘rovlar, bir nechta hisob ochib cheklovlarni chetlab o‘tish, zaifliklardan foydalanish.',
      ],
    },
    {
      heading: '12. Nizolar va jazolar',
      paragraphs: [
        'Nizolar nizo qoidalari bo‘yicha ko‘rib chiqiladi: qachon rad etish mumkin, qanday dalil qabul qilinadi va qanday jazolar qo‘llanadi. Shikoyatni administrator chat yozishmalari, e‘lon va taqdim etilgan dalillar asosida ko‘rib chiqadi.',
        'Jazo tasdiqlangan shikoyatlar soniga bog‘liq: birinchisida ogohlantirish, uchinchisida 7 kunlik blok, beshinchisida doimiy blok. Uchta shikoyatingiz asossiz deb topilsa, o‘zingiz ogohlantirilasiz.',
        'Blok davomida e‘lonlaringiz ochiq ro‘yxatlarda ko‘rinmaydi va chatdan foydalanish cheklanadi. Bloklangan foydalanuvchining ismi, blok sababi va tasdiqlangan shikoyatlar soni ochiq qora ro‘yxatda ko‘rsatiladi. Platformadan foydalanib, shunga rozilik bildirasiz.',
        'Blok hamyoningizdagi pulni yechib olishga to‘sqinlik qilmaydi. Jazoni noto‘g‘ri deb hisoblasangiz, qo‘llab-quvvatlashga yozing: murojaatingiz qayta ko‘rib chiqiladi va jazo bekor qilinishi mumkin.',
      ],
      links: [DISPUTE_RULES_LINK],
    },
    {
      heading: '13. Javobgarlik chegarasi',
      paragraphs: [
        'efBazaar akkountni garov qadamlari bo‘yicha topshirishni va muzlatilgan pulni shu shartnoma bo‘yicha taqsimlashni ta‘minlaydi. Savdodan keyin Konami tomonidan qo‘llangan bloklash, o‘yin qoidalari yoki o‘yin ichidagi o‘zgarishlar uchun platforma javob bermaydi.',
        'Platformadan tashqarida kelishilgan savdolar va o‘tkazmalar uchun efBazaar javob bermaydi.',
        'Tasdiqlangan savdodan keyin sotuvchi akkountni qaytarib olsa, buning uchun sotuvchi javob beradi. Platforma uni bloklaydi va jabrlangan tomonga o‘zida bor dalillarni taqdim etadi.',
        'Platforma «boricha» taqdim etiladi. Telegram, Google, Konami, banklar va aloqa operatorlari ishidagi uzilishlar, shuningdek rejali texnik ishlar oqibatida xizmat vaqtincha ishlamasligi mumkin. Bunday uzilish paytida savdo muddatlari uzaytirilishi yoki savdo bekor qilinib, pul qaytarilishi mumkin.',
      ],
    },
    {
      heading: '14. Hisobni yopish',
      paragraphs: [
        'Hisobni profil sahifasida o‘chirishingiz mumkin. O‘chirishdan oldin ochiq savdolarni yakunlang va hamyondagi pulni yechib oling: o‘chirilgan hisob tiklanmaydi.',
        'Platforma shu shartnomani qo‘pol buzgan foydalanuvchining hisobini bloklashi mumkin. Platforma faoliyatini to‘xtatsa, bu haqda oldindan xabar beradi va hamyondagi pulni yechib olish hamda akkount emailini ko‘chirish uchun muddat beradi.',
      ],
    },
    {
      heading: '15. Shartlarning o‘zgarishi va qo‘llanadigan qonun',
      paragraphs: [
        'Shartnoma yangilansa, yangi versiya shu sahifada e‘lon qilinadi va keyingi kirishingizda rozilik qayta so‘raladi. Rozi bo‘lmasangiz, platformadan foydalanishni to‘xtatasiz: hamyondagi pulni yechib olib, hisobni o‘chirishingiz mumkin. Boshlangan savdo u ochilgan paytdagi shartlar bo‘yicha yakunlanadi.',
        'Platformaning bot va sayt orqali yuborgan bildirishnomalari sizga rasmiy xabar hisoblanadi.',
        'Shartnomaga O‘zbekiston Respublikasi qonunchiligi qo‘llanadi. Nizo avval qo‘llab-quvvatlashga yozma murojaat orqali hal qilinadi; kelishuvga erishilmasa, nizo O‘zbekiston Respublikasi sudida ko‘riladi.',
      ],
    },
    {
      heading: '16. Aloqa',
      paragraphs: ['Savol, shikoyat va murojaatlar qo‘llab-quvvatlash sahifasi orqali qabul qilinadi.'],
      links: [SUPPORT_LINK],
    },
  ],
};

const PRIVACY: LegalDocument = {
  href: PRIVACY_HREF,
  title: 'Maxfiylik siyosati',
  intro:
    'Bu siyosat efBazaar qaysi shaxsiy ma‘lumotlarni yig‘ishi, nima uchun ishlatishi, kimga ko‘rsatishi va qancha saqlashini tushuntiradi. Platformaga kirib va «Roziman» tugmasini bosib, ma‘lumotlaringiz shu siyosat bo‘yicha qayta ishlanishiga rozilik bildirasiz.',
  sections: [
    {
      heading: '1. Qanday ma‘lumot yig‘iladi',
      paragraphs: [
        'Kirish ma‘lumotlari. Telegram orqali kirganda: Telegram ID, username, ism va profil rasmi. Google orqali kirganda yoki Google ulaganda: Google ID, email va ism. Shuningdek, oferta va shu siyosatga rozilik bergan vaqtingiz va versiyasi.',
        'E‘lon va akkount ma‘lumotlari: e‘lon matni, skrinshotlar, Konami ID, akkount emaili, o‘yin ko‘rsatkichlari, Gamer Card va turnir natijalari.',
        'Yozishmalar: chat xabarlari va yuborilgan fayllar, savdo yozishmalari, qo‘llab-quvvatlash chati, shikoyatlar va ularga ilova qilingan dalillar. Savdo chati va parol shifrlangan holda saqlanadi; bir martalik parol o‘qilgandan keyin o‘chadi.',
        'Hamyon: to‘ldirish, yechish va tarif xaridlari tarixi. Pul yechishda kiritilgan karta raqami, karta egasining ismi, telefon raqami va Telegram username. Karta raqami shifrlangan holda saqlanadi. To‘ldirishni tasdiqlash uchun platforma kartasiga kelgan o‘tkazma haqidagi bank xabari (summa va vaqt) o‘qiladi.',
        'Pochta qutilari: platforma bergan qutiga kelgan xatlar. Savdo qadamlari uchun Konami’dan kelgan xatlar avtomatik o‘qiladi.',
        'Foydalanish ma‘lumotlari: ko‘rgan va yoqtirgan e‘lonlaringiz, qidiruvlar va saqlangan kuzatuvlar — ular asosida sizga mos e‘lonlar tavsiya qilinadi. Qaysi havola yoki taklif orqali kelganingiz (kampaniya va referal kodi), rasmiy kanalga a‘zoligingiz.',
        'Texnik ma‘lumotlar: IP manzil, brauzer va qurilma turi, bildirishnoma yuborish uchun qurilma tokeni.',
      ],
    },
    {
      heading: '2. Nima uchun ishlatiladi',
      paragraphs: [
        'Shartnomani bajarish: kirish va hisobni himoyalash, e‘lon va chatlarni ko‘rsatish, garov orqali savdoni bajarish, hamyon operatsiyalari va pul yechish.',
        'Xavfsizlik: nizolarni ko‘rib chiqish va firibgarlikka qarshi kurash. Chat va savdo yozishmalari nizoda dalil sifatida ko‘riladi; bloklangan shaxs qayta ro‘yxatdan o‘tmasligi uchun uning identifikatorlari tekshiriladi.',
        'Bildirishnomalar: Telegram bot xabarlari va brauzer push-xabarlari (agar ruxsat bergan bo‘lsangiz).',
        'Xizmatni yaxshilash: tavsiyalar, sayt statistikasi va reklama havolalari samaradorligini o‘lchash.',
      ],
    },
    {
      heading: '3. Kim ko‘radi',
      paragraphs: [
        'Hammaga ko‘rinadi: profilingizdagi ism va rasm, e‘lonlaringiz, sotuvchi reytingi va sharhlar, Gamer Card, «Tasdiqlangan» va Pro belgilari. Telegram username boshqa foydalanuvchilarga ko‘rsatilmaydi.',
        'Bloklangan foydalanuvchining ismi, blok turi, sababi, sanasi va tasdiqlangan shikoyatlar soni ochiq qora ro‘yxatda ko‘rsatiladi. Konami ID, Telegram ID, username va telefon raqam ommaga chiqarilmaydi: ular faqat bloklangan shaxsni qayta ro‘yxatdan o‘tishda aniqlash uchun saqlanadi.',
        'Savdodagi qarshi tomon: savdo yozishmalari va akkountni topshirish uchun kerakli ma‘lumotlarni ko‘radi.',
        'Administratorlar: shikoyat, nizo va qo‘llab-quvvatlash murojaatlarini ko‘rib chiqishda chat va savdo yozishmalarini, to‘lov va yechish so‘rovlarini ko‘radi. Yechish so‘rovidagi karta raqami faqat to‘lovni bajaruvchi administratorga ochiladi.',
        'Tashqi xizmatlar — faqat xizmat ishlashi uchun kerak bo‘lgan hajmda: Telegram (kirish, bot, media fayllar saqlanadi), Google (kirish va Firebase orqali push-xabarlar), Yandex Metrika (sayt statistikasi va tashrif yozuvlari), YouTube (fon musiqasi). Bu xizmatlarning serverlari O‘zbekistondan tashqarida joylashgan bo‘lishi mumkin.',
        'Ma‘lumotlaringiz sotilmaydi va reklama beruvchilarga berilmaydi. Davlat organlariga ma‘lumot faqat qonunda belgilangan hollarda va tartibda beriladi.',
      ],
    },
    {
      heading: '4. Cookie va statistika',
      paragraphs: [
        'Kirgan holatingizni saqlash uchun cookie ishlatiladi. Qo‘shimcha ravishda tanlagan mavzuingiz (yorug‘ yoki qorong‘i) hamda qaysi kampaniya yoki referal havola orqali kelganingiz saqlanadi.',
        'Saytdan foydalanish statistikasi Yandex Metrika orqali yig‘iladi: tashriflar, ochilgan sahifalar va bosishlar. Saytni qulayroq qilish uchun Metrika tashrif davomidagi harakatlaringizni ham yozib oladi: sichqoncha harakati, bosishlar, sahifani aylantirish va ekranda ko‘ringan sahifa mazmuni. Bu yozuvlar Yandex serverlarida saqlanadi. Statistika va yozib olishni brauzer sozlamalari yoki reklama bloklagich orqali o‘chirib qo‘yishingiz mumkin — sayt ishlashda davom etadi.',
      ],
    },
    {
      heading: '5. Saqlash va o‘chirish',
      paragraphs: [
        'Ma‘lumotlar hisobingiz mavjud bo‘lgan davrda saqlanadi. Profil sahifasida hisobni o‘chirish mumkin: kirish ma‘lumotlaringiz (Telegram, Google, ism, rasm) o‘chadi, e‘lonlaringiz ro‘yxatlardan olinadi, yoqtirganlaringiz, shablon va shaxsiy qaydlaringiz o‘chadi.',
        'Hisob o‘chirilgandan keyin ham saqlanadi: boshqa foydalanuvchilar bilan yozishmalaringiz (ular suhbatdoshingizga ham tegishli va nizoda dalil bo‘ladi), savdolar tarixi, hamyon operatsiyalari va yechish so‘rovlari, shikoyatlar va qo‘llangan jazolar. Bu yozuvlar nizolarni hal qilish, firibgarlikning oldini olish va qonunchilik talablari uchun kerak bo‘lgan muddatda saqlanadi.',
        'Telegram’ga yuklangan e‘lon rasmlari platformaning media kanalida qoladi; ularni o‘chirishni qo‘llab-quvvatlash orqali so‘rashingiz mumkin.',
      ],
    },
    {
      heading: '6. Himoya',
      paragraphs: [
        'Karta raqamlari, savdo chati va parollar shifrlangan holda saqlanadi. Ma‘lumotlarga faqat ish yuzasidan kerak bo‘lgan administratorlar kiradi, savdo holatidagi har bir o‘zgarish jurnalga yoziladi.',
        'Hech bir tizim to‘liq himoyani kafolatlay olmaydi. Parol va tasdiqlash kodlarini hech kimga, shu jumladan o‘zini administrator deb tanishtirgan shaxsga ham bermang: platforma ularni chatda so‘ramaydi.',
      ],
    },
    {
      heading: '7. Huquqlaringiz',
      paragraphs: [
        'Siz haqingizda qanday ma‘lumot saqlanayotganini so‘rash, uni tuzatish yoki o‘chirishni talab qilish va rozilikni qaytarib olish huquqiga egasiz. Buning uchun qo‘llab-quvvatlashga yozing. Rozilikni qaytarib olsangiz, platformadan foydalanish to‘xtatiladi; 5-bo‘limda sanalgan yozuvlar saqlanib qoladi.',
        'Push-xabarlarni brauzer sozlamalarida, bot xabarlarini esa botni to‘xtatib o‘chirishingiz mumkin. Savdo qadamlari haqidagi xabarlarsiz savdoni o‘z vaqtida bajarish qiyinlashadi.',
        'Siyosat yangilansa, yangi versiya shu sahifada e‘lon qilinadi va keyingi kirishingizda rozilik qayta so‘raladi.',
      ],
      links: [SUPPORT_LINK],
    },
  ],
};

export const LEGAL_DOCUMENTS = { oferta: OFERTA, privacy: PRIVACY } as const;
