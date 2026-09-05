package uz.efbazaar.marketplace.partner.ads;

import uz.efbazaar.marketplace.domain.Listing;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Kanalga chiqadigan e'lon matni.
 *
 * <p>Ilgari bu matn UMUMAN yig'ilmasdi: {@code publish()} caption
 * o'rniga null uzatardi va Telegram matnsiz xabarni qabul qilmasdi —
 * ya'ni birorta ham post haqiqatda chiqmagan.
 *
 * <p>Tartib xaridorning savol berish tartibida: avval NARX, keyin
 * akkauntning kuchi, keyin texnik shartlar. Sotuvchining o'z tavsifi
 * eng oxirida — u eng uzun va eng oldindan aytib bo'lmaydigan qism.
 *
 * <p>Bo'sh maydon qatori butunlay chiqmaydi. "iOS coin: 0" kabi
 * qatorlar matnni uzaytirib, hech narsa qo'shmaydi va rasm ostidagi
 * 1024 belgini yeb qo'yadi.
 */
public final class ChannelPostCaption {

    /** Telegram rasm ostidagi izoh chegarasi. */
    private static final int MAX_LENGTH = 1024;
    /** Sotuvchi tavsifidan olinadigan qism. */
    private static final int DESCRIPTION_LIMIT = 180;
    /** Qimmatli kartalardan nechtasi ko'rsatiladi. */
    private static final int PLAYERS_SHOWN = 3;

    /**
     * Raqam guruhlari orasidagi UZILMAS bo'shliq (U+00A0).
     *
     * <p>Oddiy bo'shliq bo'lsa Telegram uzun narxni satr oxirida
     * bo'lib yuborishi mumkin: "4 500" bir satrda, "000" keyingisida.
     * Bu esa narxni butunlay boshqa songa aylantirib ko'rsatadi.
     */
    private static final char GROUP_SEPARATOR = '\u00A0';

    private ChannelPostCaption() {}

    /**
     * @param listingUrl matn ichidagi havola. FORWARD uchun shart:
     *                   forward qilingan xabar inline tugmasini
     *                   yo'qotadi va rasmiy kanaldagi nusxada faqat
     *                   shu havola qoladi.
     */
    public static String of(Listing listing, String listingUrl) {
        Map<String, Object> a = listing.getAttributes() == null ? Map.of() : listing.getAttributes();
        List<String> lines = new ArrayList<>();

        lines.add("🎮 <b>eFootball akkaunt</b>");
        lines.add("");
        lines.add("💰 <b>" + som(listing.getPrice()) + "</b>"
                + (listing.isPriceNegotiable() ? " · kelishiladi" : ""));

        // Akkauntning kuchi bitta qatorda: uchtasi ham kichik son va
        // alohida qatorlarga yoyilsa matn bo'sh joyga cho'ziladi.
        String strength = join(" · ",
                plain(a, "highest_division_level", v -> "🏆 Division <b>" + v + "</b>"),
                plain(a, "team_strength", v -> "TS <b>" + v + "</b>"),
                plain(a, "players_count", v -> "<b>" + v + "</b> o'yinchi"));
        if (!strength.isBlank()) lines.add(strength);

        String players = players(a.get("valuable_players"));
        if (!players.isBlank()) lines.add("⭐️ " + players);

        String coins = join(" · ",
                text(a, "android_coins", v -> "📱 Android <b>" + v + "</b>"),
                text(a, "ios_coins", v -> "iOS <b>" + v + "</b>"));
        if (!coins.isBlank()) lines.add(coins + " coin");

        String links = join(" · ",
                flag(a, "has_google_play_link", "🔗 Google Play ulangan"),
                flag(a, "has_game_center_link", "🔗 Game Center ulangan"));
        if (!links.isBlank()) lines.add(links);

        String description = shorten(listing.getDescription());
        if (!description.isBlank()) {
            lines.add("");
            lines.add(escape(description));
        }

        lines.add("");
        lines.add("🛡 <a href=\"" + escape(listingUrl) + "\">efBazaar</a>"
                + " — pul savdo tugaguncha xavfsiz saqlanadi");

        return clamp(String.join("\n", lines));
    }

    /**
     * Sotilgan e'lon: boshida SOTILDI, qolgani ustidan chizilgan.
     *
     * <p>Havola OLIB TASHLANADI. Post kanalda qolaveradi va uni bosgan
     * odam mavjud bo'lmagan taklifga borardi — ustidan chizilgan matn
     * o'qilmasa ham havola bosiladi.
     */
    public static String sold(String original) {
        String body = original == null ? "" : stripLinks(original);
        return clamp("<b>❌ SOTILDI</b>\n\n<s>" + body + "</s>");
    }

    private static String stripLinks(String html) {
        // <a href="..">matn</a> → matn. Ustidan chizilgan havola ham
        // bosiladigan havolaligicha qoladi.
        return html.replaceAll("<a\\s+href=\"[^\"]*\"\\s*>", "").replace("</a>", "");
    }

    private static String players(Object raw) {
        if (!(raw instanceof Collection<?> collection) || collection.isEmpty()) return "";
        List<String> names = collection.stream()
                .map(ChannelPostCaption::playerName)
                .filter(s -> !s.isBlank())
                .limit(PLAYERS_SHOWN)
                .map(ChannelPostCaption::escape)
                .toList();
        if (names.isEmpty()) return "";
        int rest = collection.size() - names.size();
        return String.join(", ", names) + (rest > 0 ? " +" + rest : "");
    }

    /** Guruhlangan son — pul va coin uchun. */
    /**
     * Karta nomi.
     *
     * <p>{@code valuable_players} matnlar ro'yxati EMAS — u
     * {@code CARD_LIST} va elementlari {@code name},
     * {@code overall_rating}, {@code image_url} kabi kalitlarga ega
     * obyektlar. Ularga {@code toString()} qo'llash butun map'ni
     * postga to'kib tashlaydi: skill ro'yxati, efhub identifikatori
     * va rasm manzili bilan birga — aynan shu kanalda chiqib ketgan.
     *
     * <p>Matn ham qabul qilinadi: eski e'lonlarda bu maydon oddiy
     * ro'yxat bo'lgan bo'lishi mumkin.
     */
    private static String playerName(Object card) {
        if (card == null) return "";
        if (card instanceof Map<?, ?> map) {
            Object name = map.get("name");
            return name == null ? "" : name.toString().trim();
        }
        return card.toString().trim();
    }

    private static String text(Map<String, Object> a, String key,
                               java.util.function.Function<String, String> format) {
        return field(a, key, format, true);
    }

    /**
     * Guruhlanmagan son — division, TS, o'yinchi soni.
     *
     * <p>Bular REYTING va SANOQ, pul emas. "TS 3 250" o'sha reytingni
     * pul summasidek ko'rsatadi va odam uni o'qishga bir lahza
     * to'xtaydi; o'yinchilar orasida u har doim 3250 deb yoziladi.
     */
    private static String plain(Map<String, Object> a, String key,
                                java.util.function.Function<String, String> format) {
        return field(a, key, format, false);
    }

    private static String field(Map<String, Object> a, String key,
                                java.util.function.Function<String, String> format,
                                boolean grouped) {
        Object raw = a.get(key);
        if (raw == null) return "";
        String value = raw.toString().trim();
        // Nol coin yoki nol division hech narsa aytmaydi.
        if (value.isEmpty() || "0".equals(value)) return "";
        return format.apply(escape(grouped ? number(value) : value));
    }

    private static String flag(Map<String, Object> a, String key, String label) {
        return Boolean.TRUE.equals(a.get(key)) || "true".equals(String.valueOf(a.get(key)))
                ? label : "";
    }

    /** Katta sonlarni bo'shliq bilan ajratadi: 12400 → 12 400. */
    private static String number(String value) {
        if (!value.matches("\\d{4,}")) return value;
        StringBuilder sb = new StringBuilder();
        int count = 0;
        for (int i = value.length() - 1; i >= 0; i--) {
            sb.append(value.charAt(i));
            if (++count % 3 == 0 && i > 0) sb.append(GROUP_SEPARATOR);
        }
        return sb.reverse().toString();
    }

    private static String som(BigDecimal price) {
        if (price == null) return "Narx kelishiladi";
        return number(price.stripTrailingZeros().toPlainString()) + " so'm";
    }

    private static String shorten(String description) {
        if (description == null) return "";
        String flat = description.replaceAll("\\s+", " ").trim();
        if (flat.length() <= DESCRIPTION_LIMIT) return flat;
        // So'z o'rtasidan kesmaymiz: yarim so'z e'tiborsizlikdek ko'rinadi.
        int cut = flat.lastIndexOf(' ', DESCRIPTION_LIMIT);
        return flat.substring(0, cut > 0 ? cut : DESCRIPTION_LIMIT) + "…";
    }

    private static String join(String separator, String... parts) {
        return String.join(separator, java.util.Arrays.stream(parts)
                .filter(s -> s != null && !s.isBlank()).toList());
    }

    /**
     * Chegaradan oshsa OXIRIDAN emas, tavsifdan qisqartirilardi — lekin
     * u allaqachon qisqartirilgan. Bu yerga yetib kelish uchun e'lon
     * g'ayrioddiy bo'lishi kerak, shuning uchun oddiy kesish yetadi:
     * Telegram uzun matnni butunlay rad etadi va post yo'qoladi.
     */
    private static String clamp(String text) {
        return text.length() <= MAX_LENGTH ? text : text.substring(0, MAX_LENGTH - 1) + "…";
    }

    private static String escape(String s) {
        return s == null ? "" : s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;");
    }
}
