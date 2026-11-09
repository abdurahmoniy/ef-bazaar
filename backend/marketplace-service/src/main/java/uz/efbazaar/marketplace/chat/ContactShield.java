package uz.efbazaar.marketplace.chat;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
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
 *
 * <p>{@code @} belgisiz username ham shu sababli faqat ikki holatda
 * tan olinadi: chat ishtirokchisining haqiqiy username'i bo'lsa, yoki
 * kontakt kalit so'zidan ("tg", "lichka", "nik"...) keyin kelsa. Har bir
 * lotincha so'zni yashirsak "Mbappe" va "toza_akk" ham ketardi.
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

    private static final Pattern WORD_OR_PLACEHOLDER = Pattern.compile(
            Pattern.quote(PLACEHOLDER) + "|[A-Za-z0-9_]+");

    private static final String WORD_END = "(?![\\p{L}\\p{N}_])";
    private static final String SEPARATOR = "[\\s:=\\-–—,]*";
    /** Kalit bilan username orasida kelishi mumkin: "lichkaga yozing seller_uz". */
    private static final String FILLER = "(?:yoz\\p{L}*|напиш\\p{L}*|пиш\\p{L}*|mana|вот)";

    /**
     * Kontakt kalit so'zi va undan keyingi username'ga o'xshash token.
     *
     * <p>Token yolg'iz o'zi yashirish uchun yetmaydi ("telegramdan yozing",
     * "tg orqali emas"): {@link #looksLikeHandle} yoki ajratib yozilgan
     * qo'shimcha ({@code suffix}: "seller ga yozing") ham kerak.
     */
    private static final Pattern KEYWORD_TOKEN = Pattern.compile(
            "(?iu)(?<![\\p{L}\\p{N}_])"
                    + "(?:telegram\\p{L}*|телеграм\\p{L}*|lichka\\p{L}*|личк\\p{L}*"
                    + "|(?:tg|username|user|nik|nick)(?:im|imiz|ing|ingiz|m|i|ga|da|dan|ni)?"
                    + "|(?:тг|ник)(?:ом|а|е|у|и)?)"
                    + "(?:['’ʻʼ`]\\p{L}+)?" + WORD_END
                    + SEPARATOR
                    + "(?:" + FILLER + WORD_END + SEPARATOR + ")?"
                    + "(?!" + FILLER + WORD_END + ")"
                    + "(?<token>[A-Za-z][A-Za-z0-9_]{4,31})(?![A-Za-z0-9_@])"
                    + "(?<suffix>\\s+(?:ga|ge|qa|ka)" + WORD_END + ")?");

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
        return mask(text, Set.of());
    }

    /**
     * @param knownHandles chat ishtirokchilarining Telegram username'lari
     *                     ({@code @} bilan yoki usiz); bo'sh bo'lishi mumkin
     */
    public static Result mask(String text, Set<String> knownHandles) {
        if (text == null || text.isBlank()) return new Result(text, false);

        String masked = TG_LINK.matcher(text).replaceAll(PLACEHOLDER);
        masked = TG_HANDLE.matcher(masked).replaceAll(PLACEHOLDER);
        masked = maskTokensAfterKeyword(masked);
        masked = maskKnownHandles(masked, knownHandles);
        masked = maskPhones(masked);
        return new Result(masked, !masked.equals(text));
    }

    private static String maskKnownHandles(String text, Set<String> knownHandles) {
        Set<String> handles = new HashSet<>();
        for (String handle : knownHandles) {
            String normalized = handle.strip().replaceFirst("^@", "").toLowerCase(Locale.ROOT);
            if (!normalized.isEmpty()) handles.add(normalized);
        }
        if (handles.isEmpty()) return text;

        Matcher word = WORD_OR_PLACEHOLDER.matcher(text);
        StringBuilder out = new StringBuilder();
        int copied = 0;
        while (word.find()) {
            if (!handles.contains(word.group().toLowerCase(Locale.ROOT))) continue;
            if (isPartOfEmail(text, word.start(), word.end())) continue;
            out.append(text, copied, word.start()).append(PLACEHOLDER);
            copied = word.end();
        }
        return out.append(text.substring(copied)).toString();
    }

    private static boolean isPartOfEmail(String text, int start, int end) {
        boolean afterAt = start > 0 && text.charAt(start - 1) == '@';
        boolean beforeAt = end + 1 < text.length() && text.charAt(end) == '@'
                && Character.isLetterOrDigit(text.charAt(end + 1));
        return afterAt || beforeAt;
    }

    private static String maskTokensAfterKeyword(String text) {
        Matcher match = KEYWORD_TOKEN.matcher(text);
        StringBuilder out = new StringBuilder();
        int copied = 0;
        int from = 0;
        while (match.find(from)) {
            if (!looksLikeHandle(match.group("token")) && match.group("suffix") == null) {
                // Token o'zi kalit so'z bo'lishi mumkin: "telegram username seller_uz".
                from = match.start("token");
                continue;
            }
            out.append(text, copied, match.start("token")).append(PLACEHOLDER);
            copied = match.end("token");
            from = copied;
        }
        return out.append(text.substring(copied)).toString();
    }

    private static boolean looksLikeHandle(String token) {
        return token.chars().anyMatch(c -> c == '_' || Character.isDigit(c));
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
