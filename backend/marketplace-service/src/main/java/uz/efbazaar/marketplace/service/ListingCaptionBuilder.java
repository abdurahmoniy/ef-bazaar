package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;
import uz.efbazaar.marketplace.security.AuthSummaryClient;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Composes the caption attached to the first photo of a listing's Telegram
 * media group. Emits HTML — TelegramApiClient.sendMediaGroup sets
 * {@code parse_mode: HTML} — so field labels can be bolded and card lists
 * render as bullet points with rating/type/position/style badges.
 *
 * <p>User-supplied text (description, attribute strings) is HTML-escaped
 * before it hits the caption so no `<` in the description breaks the parse.
 * Telegram limits captions to 1024 chars — this builder truncates the
 * description tail if the total spills over.
 */
@Component
@RequiredArgsConstructor
public class ListingCaptionBuilder {

    private static final int MAX_CAPTION_LENGTH = 1024;
    private static final int DESCRIPTION_HEAD_CHARS = 200;
    // Telegram caption limit is 1024. A listing with 12+ cards easily blows
    // past that (each card ~60-90 chars) and the tail truncate used to split
    // an HTML tag pair, producing "can't find end tag" 400s. Capping the
    // per-card render keeps the important header + attributes + description
    // visible; the extras get summarised as "va yana N ta karta".
    private static final int MAX_CARDS_PER_LIST = 5;
    private static final DecimalFormat PRICE_FORMAT = new DecimalFormat(
            "#,##0", DecimalFormatSymbols.getInstance(Locale.US));
    static { PRICE_FORMAT.setGroupingSize(3); }

    private final AttributeDefinitionRepository definitions;
    private final AuthSummaryClient users;

    public String build(Listing listing) {
        StringBuilder sb = new StringBuilder(512);

        sb.append("<b>Listing</b> <code>")
                .append(escape(shortId(listing.getId().toString())))
                .append("</code>\n");
        users.resolve(listing.getSellerId()).ifPresent(seller -> {
            String username = seller.telegramUsername() == null ? "" : seller.telegramUsername().strip();
            if (username.startsWith("@")) username = username.substring(1);
            if (!username.isBlank()) {
                sb.append("<b>Sotuvchi:</b> @").append(escape(username)).append('\n');
            } else if (seller.telegramId() != null) {
                sb.append("<b>Sotuvchi Telegram ID:</b> <code>")
                        .append(seller.telegramId()).append("</code>\n");
            }
        });
        sb.append("<b>Narx:</b> ").append(escape(formatPrice(listing.getPrice()))).append(" so'm");
        if (listing.isPriceNegotiable()) {
            sb.append(" <i>(kelishuvli)</i>");
        }
        sb.append('\n');

        Map<String, Object> attrs = listing.getAttributes();
        if (attrs != null && !attrs.isEmpty()) {
            List<AttributeDefinition> defs =
                    definitions.findAllByActiveTrueOrderByPositionAsc();
            for (AttributeDefinition def : defs) {
                Object raw = attrs.get(def.getKey());
                if (raw == null) continue;
                appendAttribute(sb, def, raw);
            }
        }

        String description = listing.getDescription();
        if (description != null && !description.isBlank()) {
            sb.append('\n').append(escape(head(description, DESCRIPTION_HEAD_CHARS)));
        }

        return truncate(sb.toString(), MAX_CAPTION_LENGTH);
    }

    private static void appendAttribute(StringBuilder sb, AttributeDefinition def, Object raw) {
        // Card lists get their own block so the badges show up on separate lines.
        if (raw instanceof List<?> list && !list.isEmpty() && list.get(0) instanceof Map<?, ?>) {
            String cards = renderCardList(list);
            if (cards.isEmpty()) return;
            sb.append("<b>").append(escape(def.getLabelUz())).append(":</b>\n").append(cards);
            return;
        }
        String rendered = renderValue(raw);
        if (rendered.isEmpty()) return;
        sb.append("<b>").append(escape(def.getLabelUz())).append(":</b> ")
                .append(rendered).append('\n');
    }

    @SuppressWarnings("unchecked")
    private static String renderCardList(List<?> list) {
        StringBuilder out = new StringBuilder();
        int shown = 0;
        int skipped = 0;
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> map)) continue;
            Map<String, Object> card = (Map<String, Object>) map;
            Object name = card.get("name");
            if (!(name instanceof String s) || s.isBlank()) continue;
            if (shown >= MAX_CARDS_PER_LIST) {
                skipped++;
                continue;
            }
            out.append("• <b>").append(escape(s)).append("</b>");
            String suffix = cardSuffix(card);
            if (!suffix.isEmpty()) out.append(' ').append(suffix);
            out.append('\n');
            shown++;
        }
        if (skipped > 0) {
            out.append("• <i>va yana ").append(skipped).append(" ta karta</i>\n");
        }
        return out.toString();
    }

    private static String cardSuffix(Map<String, Object> card) {
        StringBuilder parts = new StringBuilder();
        Object rating = card.get("overall_rating");
        Object type = card.get("card_type");
        if (rating instanceof Number || type instanceof String) {
            parts.append("<code>");
            if (type instanceof String t && !t.isBlank()) {
                parts.append(escape(t));
                if (rating instanceof Number) parts.append(' ');
            }
            if (rating instanceof Number n) parts.append(n.intValue());
            parts.append("</code>");
        }
        Object position = card.get("position");
        if (position instanceof String p && !p.isBlank()) {
            if (parts.length() > 0) parts.append(" · ");
            parts.append(escape(p));
        }
        Object style = card.get("playing_style");
        if (style instanceof String st && !st.isBlank()) {
            if (parts.length() > 0) parts.append(" · ");
            parts.append("<i>").append(escape(st)).append("</i>");
        }
        return parts.toString();
    }

    private static String shortId(String uuid) {
        int dash = uuid.indexOf('-');
        return dash > 0 ? uuid.substring(0, dash) : uuid;
    }

    private static String formatPrice(BigDecimal price) {
        if (price == null) return "-";
        return PRICE_FORMAT.format(price).replace(',', ' ');
    }

    private static String renderValue(Object raw) {
        if (raw instanceof Boolean b) {
            return b ? "ha" : "yo'q";
        }
        if (raw instanceof List<?> list) {
            StringBuilder joined = new StringBuilder();
            for (Object item : list) {
                if (item == null) continue;
                String s = item.toString().strip();
                if (s.isEmpty()) continue;
                if (joined.length() > 0) joined.append(", ");
                joined.append(escape(s));
            }
            return joined.toString();
        }
        return escape(raw.toString());
    }

    /** Minimal HTML-escape for Telegram HTML parse_mode. */
    private static String escape(String s) {
        if (s == null || s.isEmpty()) return "";
        return s.replace("&", "&amp;")
                .replace("<", "&lt;")
                .replace(">", "&gt;");
    }

    private static String head(String s, int max) {
        String stripped = s.strip();
        if (stripped.length() <= max) return stripped;
        return stripped.substring(0, max).stripTrailing() + "…";
    }

    /**
     * Safety net: the primary sizing is done via MAX_CARDS_PER_LIST +
     * DESCRIPTION_HEAD_CHARS, so this branch should rarely fire. When it does
     * (e.g. an unusually long attribute value), we cut at the last '\n' before
     * {@code max} so an HTML tag pair is never severed. Every line in the
     * caption is self-balanced (<b>...</b>, <code>...</code>, <i>...</i>);
     * cutting on a newline is always safe. Only in the degenerate "no newline
     * in budget" case do we strip HTML entirely.
     */
    private static String truncate(String s, int max) {
        if (s.length() <= max) return s;
        int cutoff = max - 1;
        int lastNewline = s.lastIndexOf('\n', cutoff);
        if (lastNewline > 0) {
            return s.substring(0, lastNewline) + "\n…";
        }
        return s.substring(0, cutoff).replaceAll("<[^>]*>", "") + "…";
    }
}
