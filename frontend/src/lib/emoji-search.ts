import type { EmojiItem, EmojiPackDetail } from '@/lib/emoji-packs';

export interface QuickCategory {
  id: string;
  emoji: string;
  label: string;
}

export const QUICK_CATEGORIES: QuickCategory[] = [
  { id: 'heart', emoji: '❤️', label: 'Yurak' },
  { id: 'like', emoji: '👍', label: 'Like' },
  { id: 'dislike', emoji: '👎', label: 'Dislike' },
  { id: 'party', emoji: '🎉', label: 'Bayram' },
  { id: 'joy', emoji: '😄', label: 'Kulgi' },
  { id: 'cry', emoji: '😢', label: 'Yig`i' },
  { id: 'angry', emoji: '😡', label: 'Jahl' },
  { id: 'fire', emoji: '🔥', label: 'Olov' },
  { id: 'football', emoji: '⚽', label: 'Sport' },
];

/**
 * Fallback emojilarga mos kalit so'zlar xaritasi (O'zbekcha, Inglizcha, Ruscha).
 */
const EMOJI_KEYWORDS: Record<string, string[]> = {
  '😂': ['smile', 'laugh', 'happy', 'joy', 'lol', 'kulgi', 'xursand', 'tabassum', 'quvonch', 'hazil', 'смех', 'улыбка', 'радость'],
  '🤣': ['rofl', 'laugh', 'kulgi', 'dumalab kulish', 'смех'],
  '😄': ['smile', 'happy', 'joy', 'kulgi', 'xursand', 'quvonch', 'улыбка', 'радость'],
  '😁': ['grin', 'smile', 'kulgi', 'tish', 'тиши', 'улыбка'],
  '😆': ['laugh', 'xd', 'kulgi', 'xursand', 'смех'],
  '😀': ['smile', 'happy', 'tabassum', 'xursand', 'улыбка'],
  '😃': ['smile', 'happy', 'tabassum', 'улыбка'],
  '🙂': ['smile', 'slight', 'yengil tabassum', 'улыбка'],
  '😉': ['wink', 'playful', 'ko`z qisish', 'hazil', 'подмигивание'],
  '😜': ['wink', 'tongue', 'til', 'hazil', 'шутка'],
  '😝': ['tongue', 'laugh', 'til', 'kulgi'],
  '🤪': ['crazy', 'wild', 'telba', 'jinni', 'quvnoq', 'сумасшедший'],
  '🥰': ['love', 'in love', 'hearts', 'sevgi', 'muhabbat', 'yoqtirish', 'любовь'],
  '😍': ['love', 'heart eyes', 'sevgi', 'oshiq', 'hayrat', 'влюблен'],
  '😘': ['kiss', 'love', 'o`pish', 'sevgi', 'поцелуй'],
  '😚': ['kiss', 'o`pish', 'поцелуй'],
  '❤️': ['heart', 'love', 'red heart', 'yurak', 'sevgi', 'muhabbat', 'dil', 'сердце', 'любовь'],
  '💖': ['heart', 'sparkle', 'love', 'yurak', 'sevgi', 'сердце'],
  '💕': ['two hearts', 'love', 'yuraklar', 'sevgi', 'сердца'],
  '💞': ['revolving hearts', 'sevgi', 'yurak'],
  '💓': ['beating heart', 'urayotgan yurak', 'sevgi'],
  '💗': ['growing heart', 'yurak', 'sevgi'],
  '💘': ['heart with arrow', 'kamondan yurak', 'oshiq'],
  '💔': ['broken heart', 'sinishi', 'yurak singan', 'ayriliq', 'разбитое сердце'],
  '🔥': ['fire', 'flame', 'lit', 'hot', 'olov', 'alanga', 'issiq', 'yonish', 'yondi', 'bomba', 'огонь', 'пламя', 'жар'],
  '👍': ['thumbs up', 'like', 'agree', 'good', 'zo`r', 'zor', 'tasdiq', 'ha', 'yaxshi', 'layk', 'лайк', 'хорошо', 'да'],
  '👏': ['clap', 'applause', 'bravo', 'qarsak', 'ofarin', 'balli', 'аплодисменты', 'браво'],
  '🤝': ['handshake', 'deal', 'agreement', 'kelishuv', 'qo`l berish', 'do`stlik', 'рукопожатие', 'договор'],
  '🙌': ['celebrate', 'hands up', 'qoyil', 'hurra', 'ура'],
  '👌': ['ok', 'perfect', 'al`o', 'alo', 'joyida', 'aniq', 'отлично'],
  '✌️': ['victory', 'peace', 'g`alaba', 'tinchlik', 'победа'],
  '👎': ['thumbs down', 'dislike', 'bad', 'no', 'yomon', 'yo`q', 'dislayk', 'rad', 'дизлайк', 'нет', 'плохо'],
  '❌': ['cross', 'wrong', 'no', 'xato', 'yo`q', 'bekor', 'отмена', 'крест'],
  '🚫': ['prohibited', 'no', 'taqiqlangan', 'mumkin emas', 'запрещено'],
  '⚽': ['football', 'soccer', 'ball', 'sport', 'goal', 'pes', 'efootball', 'fifa', 'to`p', 'top', 'futbol', 'gol', 'sport', 'мяч', 'футбол', 'гол'],
  '🏆': ['trophy', 'cup', 'champion', 'winner', 'kubok', 'chempion', 'g`olib', 'sovringa', 'кубок', 'чемпион'],
  '🥇': ['first', 'gold', 'medal', 'oltin', 'birinchi', 'g`olib', 'золото', 'первый'],
  '🥈': ['silver', 'ikkinchi', 'kumush', 'серебро'],
  '🥉': ['bronze', 'uchinchi', 'bronza', 'бронза'],
  '🥅': ['goal net', 'darvoza', 'to`r', 'ворота'],
  '👟': ['shoe', 'cleats', 'butsa', 'oyoq kiyim', 'бутсы'],
  '😢': ['cry', 'sad', 'tear', 'yig`i', 'ko`z yoshi', 'xafa', 'alam', 'слезы', 'грусть', 'плач'],
  '😭': ['loudly crying', 'sob', 'ho`ngrab yig`lash', 'dod', 'yig`i', 'рыдать', 'слезы'],
  '🥺': ['pleading', 'puppy eyes', 'iltimos', 'yolvorish', 'uzr', 'умолять'],
  '😞': ['disappointed', 'xafa', 'umidsiz', 'разочарование'],
  '😔': ['pensive', 'sad', 'g`amgin', 'xafa', 'грустный'],
  '😡': ['angry', 'rage', 'mad', 'jahl', 'g`azab', 'asabiy', 'tuturuqsiz', 'злой', 'злость', 'гнев'],
  '🤬': ['cursing', 'swearing', 'so`kinish', 'jahl', 'мат', 'ругань'],
  '👿': ['devil', 'shayton', 'yovuz', 'черт'],
  '😤': ['triumph', 'huff', 'tutab ketish', 'tutqanoq'],
  '🎉': ['party', 'popper', 'celebrate', 'congrats', 'bayram', 'tabrik', 'salut', 'muborak', 'nishonlash', 'праздник', 'ура'],
  '🥳': ['party face', 'tug`ilgan kun', 'bayram', 'праздник'],
  '🎊': ['confetti', 'tabrik', 'bayram', 'конфетти'],
  '⭐': ['star', 'favorite', 'yulduz', 'tanlangan', 'yaxshi', 'звезда'],
  '🌟': ['glowing star', 'yulduz', 'porlash', 'сияние'],
  '✨': ['sparkles', 'magic', 'yulduzchalar', 'nur', 'sehr', 'блеск'],
  '💰': ['money bag', 'dollar', 'cash', 'pul', 'qop', 'boylik', 'so`m', 'деньги', 'мешок'],
  '💵': ['dollar', 'money', 'banknote', 'pul', 'valyuta', 'доллар'],
  '💸': ['flying money', 'uchgan pul', 'xarajat', 'sarflash'],
  '💳': ['card', 'credit card', 'karta', 'to`lov', 'карта'],
  '💎': ['diamond', 'gem', 'olmos', 'qimmat', 'bomba', 'алмаз'],
  '😎': ['cool', 'sunglasses', 'krutoy', 'zo`r', 'ko`zoynak', 'qoyil', 'крутой'],
  '🤔': ['thinking', 'wonder', 'fikr', 'o`y', 'shubha', 'savol', 'qiziq', 'думать'],
  '🧐': ['monocle', 'inspect', 'tekshiruv', 'sinchkov', 'лупа'],
  '👋': ['wave', 'hello', 'hi', 'bye', 'salom', 'alik', 'xayr', 'привет', 'пока'],
  '👀': ['eyes', 'look', 'see', 'ko`z', 'qarash', 'ko`rish', 'kuzatish', 'глаза'],
  '💯': ['hundred', '100', 'perfect', 'yuz', 'a`lo', 'to`liq', 'baho', 'сто'],
  '⚡': ['lightning', 'zap', 'fast', 'chaqmoq', 'tok', 'tez', 'energiya', 'молния'],
  '🚀': ['rocket', 'launch', 'fast', 'raketa', 'start', 'parvoz', 'tez', 'ракета'],
  '👑': ['crown', 'king', 'queen', 'toj', 'qirol', 'shoh', 'g`olib', 'корона'],
  '🤖': ['bot', 'robot', 'telegram', 'avtomat', 'ai', 'робот'],
  '✅': ['check', 'done', 'yes', 'bajarildi', 'ha', 'tayyor', 'tasdiq', 'галочка', 'готово'],
};

/**
 * Kategoriyalarga tegishli fallback emojilar guruhlari.
 */
const CATEGORY_EMOJIS: Record<string, string[]> = {
  heart: ['❤️', '💖', '💕', '💞', '💓', '💗', '💘', '💔', '🥰', '😍', '😘', '😚'],
  like: ['👍', '👏', '🤝', '🙌', '👌', '✌️', '✅', '💯'],
  dislike: ['👎', '❌', '🚫'],
  party: ['🎉', '🥳', '🎊', '✨', '⭐', '🌟'],
  joy: ['😂', '🤣', '😄', '😁', '😆', '😀', '😃', '🙂', '😉', '😜', '😝', '🤪'],
  cry: ['😢', '😭', '🥺', '😞', '😔'],
  angry: ['😡', '🤬', '👿', '😤'],
  fire: ['🔥', '⚡', '🚀'],
  football: ['⚽', '🏆', '🥇', '🥈', '🥉', '🥅', '👟'],
};

function normalize(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`'ʻʼ]/g, "'");
}

/**
 * Emojilar to'plamlaridan qidiruv bo'yicha mos keluvchi emojilarni topadi.
 *
 * <p>Qidiruv imkoniyatlari:
 * <ul>
 *   <li><b>Asl emoji</b>: foydalanuvchi qidiruvga "😂" yoki "⚽" kiritganda to'g'ridan-to'g'ri moslash;</li>
 *   <li><b>Kalit so'zlar</b>: "kulgi", "olov", "yurak", "pul", "football", "smile" va hk.;</li>
 *   <li><b>To'plam nomi</b>: "Pars", "EPIC", "Anime" va hk.;</li>
 *   <li><b>Tezkor reaksiya toifasi</b>: quickCategory filtri tanlanganda.</li>
 * </ul>
 */
export function searchCustomEmojis(
  packs: EmojiPackDetail[],
  query: string,
  categoryId?: string | null,
): EmojiItem[] {
  const cleanQuery = normalize(query);
  const targetCategoryEmojis = categoryId && CATEGORY_EMOJIS[categoryId]
    ? new Set(CATEGORY_EMOJIS[categoryId])
    : null;

  const results: EmojiItem[] = [];
  const seenIds = new Set<string>();

  for (const pack of packs) {
    const packMatches = cleanQuery.length > 1 && (
      normalize(pack.title).includes(cleanQuery) ||
      normalize(pack.setName).includes(cleanQuery)
    );

    for (const item of pack.items) {
      if (seenIds.has(item.customEmojiId)) continue;

      // Kategoriya tekshiruvi
      if (targetCategoryEmojis && !targetCategoryEmojis.has(item.emoji)) {
        continue;
      }

      // Agar qidiruv so'rovi bo'sh bo'lsa, faqat kategoriya filtri ishlaydi
      if (!cleanQuery) {
        seenIds.add(item.customEmojiId);
        results.push(item);
        continue;
      }

      // 1. Asl emoji bilan aniq yoki qisman mos kelish (masalan "😂" yoki "⚽")
      if (item.emoji.includes(cleanQuery) || cleanQuery.includes(item.emoji)) {
        seenIds.add(item.customEmojiId);
        results.push(item);
        continue;
      }

      // 2. Kalit so'zlar bo'yicha mos kelish
      const keywords = EMOJI_KEYWORDS[item.emoji];
      if (keywords && keywords.some((kw) => normalize(kw).includes(cleanQuery))) {
        seenIds.add(item.customEmojiId);
        results.push(item);
        continue;
      }

      // 3. To'plam nomi bo'yicha mos kelish
      if (packMatches) {
        seenIds.add(item.customEmojiId);
        results.push(item);
      }
    }
  }

  return results;
}
