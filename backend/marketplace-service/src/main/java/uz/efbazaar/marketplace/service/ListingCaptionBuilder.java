package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;

import java.math.BigDecimal;
import java.text.DecimalFormat;
import java.text.DecimalFormatSymbols;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * Composes the plain-text caption attached to the first photo of a listing's
 * Telegram media group. Format is intentionally plain (no MarkdownV2 escaping)
 * so any user-supplied text can pass through safely. Telegram limits captions to
 * 1024 chars — this builder truncates the description tail if needed.
 */
@Component
@RequiredArgsConstructor
public class ListingCaptionBuilder {

    private static final int MAX_CAPTION_LENGTH = 1024;
    private static final int DESCRIPTION_HEAD_CHARS = 200;
    private static final DecimalFormat PRICE_FORMAT = new DecimalFormat(
            "#,##0", DecimalFormatSymbols.getInstance(Locale.US));
    static { PRICE_FORMAT.setGroupingSize(3); }

    private final AttributeDefinitionRepository definitions;

    public String build(Listing listing) {
        StringBuilder sb = new StringBuilder(512);

        sb.append("Listing ").append(shortId(listing.getId().toString())).append('\n');
        sb.append("Narx: ").append(formatPrice(listing.getPrice())).append(" so'm");
        if (listing.isPriceNegotiable()) {
            sb.append(" (kelishuvli)");
        }
        sb.append('\n');

        Map<String, Object> attrs = listing.getAttributes();
        if (attrs != null && !attrs.isEmpty()) {
            List<AttributeDefinition> defs =
                    definitions.findAllByActiveTrueOrderByPositionAsc();
            for (AttributeDefinition def : defs) {
                Object raw = attrs.get(def.getKey());
                if (raw == null) continue;
                String rendered = renderValue(raw);
                if (rendered.isEmpty()) continue;
                sb.append(def.getLabelUz()).append(": ").append(rendered).append('\n');
            }
        }

        String description = listing.getDescription();
        if (description != null && !description.isBlank()) {
            sb.append('\n').append(head(description, DESCRIPTION_HEAD_CHARS));
        }

        return truncate(sb.toString(), MAX_CAPTION_LENGTH);
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
                joined.append(s);
            }
            return joined.toString();
        }
        return raw.toString();
    }

    private static String head(String s, int max) {
        String stripped = s.strip();
        if (stripped.length() <= max) return stripped;
        return stripped.substring(0, max).stripTrailing() + "…";
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
