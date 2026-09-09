package uz.efbazaar.marketplace.emoji;

import java.util.regex.Pattern;

/**
 * Admin qo'ygan havoladan Telegram to'plam nomini ajratadi.
 *
 * <p>Nom `getStickerSet?name=` ga to'g'ridan-to'g'ri ketadi, shuning uchun u
 * ikki shartga javob berishi kerak: Telegram tushunadigan bo'lsin va URL
 * yo'liga qo'yishga xavfsiz bo'lsin. Ikkinchisi uchun oxirida qat'iy shakl
 * tekshiriladi — qochib ketadigan belgi qolsa, bu so'rov injeksiyasi bo'lardi.
 *
 * <p>Odamlar havolani turlicha nusxa oladi: ulashish menyusi `?single`
 * qo'shadi, mobil klaviatura oxiriga bo'shliq qo'yadi, ba'zan esa havola
 * o'rniga bot javobidagi nomning o'zi ko'chiriladi. Uchalasi ham ishlaydi.
 */
public final class EmojiPackLink {

    /** Telegram to'plam nomi: harf, raqam, pastki chiziq. */
    private static final Pattern NAME = Pattern.compile("[A-Za-z0-9_]{1,64}");

    private static final String HOST = "t.me/";
    private static final String EMOJI_PATH = "addemoji/";
    private static final String STICKER_PATH = "addstickers/";

    private EmojiPackLink() {}

    public static String setNameOf(String input) {
        String s = input == null ? "" : input.trim();
        if (s.isEmpty()) {
            throw new IllegalArgumentException("Havola bo'sh");
        }

        String bare = s.replaceFirst("(?i)^https?://", "").replaceFirst("(?i)^www\\.", "");
        String candidate = bare;

        int host = indexOfIgnoreCase(bare, HOST);
        if (host >= 0) {
            String path = bare.substring(host + HOST.length());
            if (startsWithIgnoreCase(path, STICKER_PATH)) {
                // Ikkisi ko'rinishdan bir xil, lekin stiker to'plamini matn
                // ichiga qo'yib bo'lmaydi. Qabul qilsak, import muvaffaqiyatli
                // ko'rinardi-yu emoji hech qachon ishlamasdi.
                throw new IllegalArgumentException(
                        "Bu stiker to'plami havolasi. Emoji to'plami /addemoji/ bilan boshlanadi.");
            }
            if (!startsWithIgnoreCase(path, EMOJI_PATH)) {
                throw new IllegalArgumentException(
                        "Havola t.me/addemoji/... ko'rinishida bo'lishi kerak.");
            }
            candidate = path.substring(EMOJI_PATH.length());
        }

        candidate = cutAt(cutAt(candidate, '?'), '#').trim();

        if (!NAME.matcher(candidate).matches()) {
            throw new IllegalArgumentException(
                    "To'plam nomi topilmadi. Havolani to'liq nusxa oling: "
                            + "https://t.me/addemoji/NomiShuYerda");
        }
        return candidate;
    }

    private static String cutAt(String s, char c) {
        int i = s.indexOf(c);
        return i < 0 ? s : s.substring(0, i);
    }

    private static int indexOfIgnoreCase(String haystack, String needle) {
        return haystack.toLowerCase().indexOf(needle);
    }

    private static boolean startsWithIgnoreCase(String s, String prefix) {
        return s.regionMatches(true, 0, prefix, 0, prefix.length());
    }
}
