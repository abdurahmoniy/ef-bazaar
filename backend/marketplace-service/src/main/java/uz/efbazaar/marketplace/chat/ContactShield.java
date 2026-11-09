package uz.efbazaar.marketplace.chat;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Chat xabaridagi Telegram username va telefon raqamlarni yashiradi.
 *
 * <p>Nega: hozir xaridor e'lonni ko'radi, sotuvchiga "Telegramdan yozing"
 * deydi va savdo garovsiz, platformadan tashqarida ketadi. Aldangan odam
 * esa "efBazaar'da aldandim" deb yuradi. Kontakt yashirilgach chat
 * ostida garov orqali savdo taklifi chiqadi.
 *
 * <p>Bu filtr — to'siq emas, turtki. Qat'iy niyatli odam raqamni so'z bilan
 * yozib yuboradi va biz buni ta'qib qilmaymiz: maqsad tasodifiy, odatiy
 * "@username yozing" ni ushlash va o'sha paytda garovni eslatish.
 *
 * <p>NOTO'G'RI YASHIRISH QIMMATROQ. Bu bozorda har xabarda raqam bor:
 * Konami ID ({@code ASJE-112-079-938}), narx, sila, reyting, GP. Shuning
 * uchun telefon faqat aniq shakllarda tan olinadi: {@code +998} bilan 12
 * xona, operator kodi bilan boshlangan 9 xona, yoki {@code +} bilan
 * boshlangan xalqaro raqam.
 */
public final class ContactShield {

    public static final String PLACEHOLDER = "[kontakt yashirildi]";

    /** t.me / telegram.me havolalari. */
    private static final Pattern TG_LINK = Pattern.compile(
            "(?i)(?:https?://)?(?:t|telegram)\\.me/[A-Za-z0-9_+/-]+");

    /**
     * {@code @username}. Oldida harf, nuqta yoki @ bo'lmasligi kerak —
     * aks holda {@code seller@gmail.com} dagi pochta ham yashirilardi.
     */
    private static final Pattern TG_HANDLE = Pattern.compile(
            "(?<![\\w.@])@[A-Za-z][A-Za-z0-9_]{3,31}\\b");

    /**
     * Telefonga o'xshash raqamlar qatori: xonalar orasida bo'sh joy, tire,
     * nuqta yoki qavs. Oldida harf yoki tire bo'lsa — bu Konami ID yoki
     * kod, telefon emas.
     */
    private static final Pattern DIGIT_RUN = Pattern.compile(
            "(?<![\\w-])\\+?\\(?\\d(?:[\\s().-]{1,2}\\d|\\d){7,16}(?![\\w-])");

    /** O'zbekiston mobil operatorlari va Toshkent shahar kodi. */
    private static final Set<String> UZ_CODES = Set.of(
            "20", "33", "50", "55", "71", "77", "88", "90", "91", "93", "94", "95", "97", "98", "99");

    public record Result(String text, boolean hidden) {}

    private ContactShield() {}

    public static Result mask(String text) {
        if (text == null || text.isBlank()) return new Result(text, false);

        String masked = TG_LINK.matcher(text).replaceAll(PLACEHOLDER);
        masked = TG_HANDLE.matcher(masked).replaceAll(PLACEHOLDER);
        masked = maskPhones(masked);
        return new Result(masked, !masked.equals(text));
    }

    private static String maskPhones(String text) {
        Matcher run = DIGIT_RUN.matcher(text);
        StringBuilder out = new StringBuilder();
        int copied = 0;
        while (run.find()) {
            for (int[] span : phoneSpans(run.group(), run.start())) {
                out.append(text, copied, span[0]).append(PLACEHOLDER);
                copied = span[1];
            }
        }
        return out.append(text.substring(copied)).toString();
    }

    /**
     * Qator ichidan telefonlarni topadi. Qator bir nechta raqamni yopishtirib
     * olishi mumkin ("901234567 150000"), shuning uchun guruhlar boshidan
     * yig'iladi va telefon shakli to'lgan joyda kesiladi.
     */
    private static List<int[]> phoneSpans(String run, int offset) {
        List<int[]> spans = new ArrayList<>();
        int i = 0;
        while (i < run.length()) {
            while (i < run.length() && !Character.isDigit(run.charAt(i)) && run.charAt(i) != '+' && run.charAt(i) != '(') i++;
            if (i >= run.length()) break;

            int start = i;
            boolean plus = run.charAt(i) == '+';
            StringBuilder digits = new StringBuilder();
            int end = -1;
            for (int j = i; j < run.length(); j++) {
                char c = run.charAt(j);
                if (!Character.isDigit(c)) continue;
                digits.append(c);
                boolean groupEnds = j + 1 == run.length() || !Character.isDigit(run.charAt(j + 1));
                if (groupEnds && isPhone(digits, plus)) {
                    end = j + 1;
                    // Xalqaro raqam uzunroq bo'lishi mumkin — keyingi guruh ham sig'sa davom etamiz.
                    if (!plus || digits.length() >= 15) break;
                }
            }
            if (end < 0) {
                // Bu guruhdan telefon boshlanmaydi ("150000 901234567") — keyingisidan urinamiz.
                i = start + 1;
                while (i < run.length() && Character.isDigit(run.charAt(i))) i++;
                continue;
            }
            spans.add(new int[] {offset + start, offset + end});
            i = end;
        }
        return spans;
    }

    private static boolean isPhone(CharSequence digits, boolean plus) {
        int n = digits.length();
        String d = digits.toString();
        if (n == 12 && d.startsWith("998")) return true;
        if (n == 9 && UZ_CODES.contains(d.substring(0, 2))) return true;
        return plus && n >= 10 && n <= 15;
    }
}
