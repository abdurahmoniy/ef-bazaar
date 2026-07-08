package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.domain.AttributeType;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * Coerces + validates the {@code attributes} payload attached to a listing
 * against the active {@link AttributeDefinition} rows. Returns a normalized map
 * suitable for JSONB persistence (numbers become {@link BigDecimal} or
 * {@link Boolean}, strings are trimmed, lists are copied defensively).
 *
 * <p>Rejects unknown keys and missing-required with 400 so typos don't silently
 * disappear into the JSONB blob.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AttributeValidator {

    private final AttributeDefinitionRepository repository;

    public Map<String, Object> validate(Map<String, Object> input) {
        Map<String, Object> values = input == null ? Map.of() : input;
        List<AttributeDefinition> definitions = repository.findAllByActiveTrueOrderByPositionAsc();
        Map<String, AttributeDefinition> byKey = definitions.stream()
                .collect(Collectors.toMap(AttributeDefinition::getKey, Function.identity()));

        // Unknown keys — reject before we do anything else.
        for (String key : values.keySet()) {
            if (!byKey.containsKey(key)) {
                throw MarketplaceException.unknownAttribute(key);
            }
        }

        Map<String, Object> normalized = new HashMap<>();
        for (AttributeDefinition def : definitions) {
            Object raw = values.get(def.getKey());
            if (raw == null) {
                if (def.isRequired()) {
                    throw MarketplaceException.missingRequiredAttribute(def.getKey());
                }
                continue;
            }
            normalized.put(def.getKey(), coerceAndCheck(def, raw));
        }

        applyCrossFieldRules(normalized);
        return normalized;
    }

    /**
     * Cross-field consistency rules that can't be expressed as per-attribute
     * constraints. Currently: coin balances only make sense when the matching
     * platform binding is set — an iOS-only account can't hold Android coins.
     * Rules operate on the normalized map so INT values are already {@link Long}
     * and BOOLEAN values are already {@link Boolean}.
     */
    private void applyCrossFieldRules(Map<String, Object> normalized) {
        requirePlatformLinkForCoins(normalized, "android_coins", "has_google_play_link");
        requirePlatformLinkForCoins(normalized, "ios_coins",     "has_game_center_link");
    }

    private void requirePlatformLinkForCoins(Map<String, Object> normalized,
                                             String coinsKey,
                                             String linkKey) {
        Object coins = normalized.get(coinsKey);
        if (!(coins instanceof Long n) || n <= 0) return;
        Object link = normalized.get(linkKey);
        if (!(link instanceof Boolean b) || !b) {
            throw MarketplaceException.invalidAttributeValue(coinsKey,
                    "faqat " + linkKey + " = true bo'lganda kiritish mumkin");
        }
    }

    // ---------- per-type handling ----------

    private Object coerceAndCheck(AttributeDefinition def, Object raw) {
        return switch (def.getType()) {
            case INT       -> validateInt(def, raw);
            case DECIMAL   -> validateDecimal(def, raw);
            case BOOLEAN   -> validateBoolean(def, raw);
            case STRING    -> validateString(def, raw, false);
            case TEXT      -> validateString(def, raw, true);
            case LIST_STRING -> validateListString(def, raw);
            case ENUM      -> validateEnum(def, raw);
            case CARD_LIST -> validateCardList(def, raw);
        };
    }

    private Long validateInt(AttributeDefinition def, Object raw) {
        long n;
        if (raw instanceof Number num) {
            double d = num.doubleValue();
            if (d != Math.floor(d) || Double.isInfinite(d)) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(), "butun son emas");
            }
            n = num.longValue();
        } else if (raw instanceof String s) {
            try {
                n = Long.parseLong(s.trim());
            } catch (NumberFormatException e) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(), "butun son emas");
            }
        } else {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "INT kutilgan");
        }
        Long min = readLongConstraint(def, "min");
        Long max = readLongConstraint(def, "max");
        if (min != null && n < min) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "min=" + min);
        }
        if (max != null && n > max) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "max=" + max);
        }
        return n;
    }

    private BigDecimal validateDecimal(AttributeDefinition def, Object raw) {
        BigDecimal n;
        if (raw instanceof Number num) {
            n = new BigDecimal(num.toString());
        } else if (raw instanceof String s) {
            try {
                n = new BigDecimal(s.trim());
            } catch (NumberFormatException e) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(), "son emas");
            }
        } else {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "DECIMAL kutilgan");
        }
        BigDecimal min = readDecimalConstraint(def, "min");
        BigDecimal max = readDecimalConstraint(def, "max");
        if (min != null && n.compareTo(min) < 0) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "min=" + min);
        }
        if (max != null && n.compareTo(max) > 0) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "max=" + max);
        }
        return n;
    }

    private Boolean validateBoolean(AttributeDefinition def, Object raw) {
        if (raw instanceof Boolean b) return b;
        if (raw instanceof String s) {
            String t = s.trim().toLowerCase();
            if (t.equals("true"))  return Boolean.TRUE;
            if (t.equals("false")) return Boolean.FALSE;
        }
        throw MarketplaceException.invalidAttributeValue(def.getKey(), "BOOLEAN kutilgan");
    }

    private String validateString(AttributeDefinition def, Object raw, boolean multiline) {
        if (!(raw instanceof String s)) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "matn kutilgan");
        }
        String trimmed = multiline ? s : s.strip();
        Integer maxLength = readIntConstraint(def, "max_length");
        if (maxLength != null && trimmed.length() > maxLength) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(),
                    "matn uzunligi " + maxLength + " dan oshib ketdi");
        }
        String regex = readStringConstraint(def, "regex");
        if (regex != null && !regex.isEmpty() && !Pattern.compile(regex).matcher(trimmed).matches()) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "regex mos kelmadi");
        }
        return trimmed;
    }

    private List<String> validateListString(AttributeDefinition def, Object raw) {
        if (!(raw instanceof List<?> list)) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "ro'yxat kutilgan");
        }
        Integer itemMax = readIntConstraint(def, "item_max_length");
        List<String> normalized = new ArrayList<>(list.size());
        Set<String> seen = new HashSet<>();
        for (Object item : list) {
            if (!(item instanceof String s)) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "har bir element string bo'lishi kerak");
            }
            String v = s.strip();
            if (v.isEmpty()) continue;
            if (itemMax != null && v.length() > itemMax) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "element uzunligi " + itemMax + " dan oshib ketdi: " + v);
            }
            if (seen.add(v)) normalized.add(v);
        }
        return normalized;
    }

    /**
     * Array of card objects. Enforces the minimum contract every consumer
     * relies on (efhub_id + name), preserves every other field the frontend
     * sends so we can search by skill / rating / type later without a schema
     * change. Duplicates by efhub_id are collapsed.
     */
    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> validateCardList(AttributeDefinition def, Object raw) {
        if (!(raw instanceof List<?> list)) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "ro'yxat kutilgan");
        }
        Integer maxItems = readIntConstraint(def, "max_items");
        if (maxItems != null && list.size() > maxItems) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(),
                    "maksimum " + maxItems + " ta card");
        }
        List<Map<String, Object>> normalized = new ArrayList<>(list.size());
        Set<Long> seenIds = new HashSet<>();
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "har bir element obyekt bo'lishi kerak");
            }
            Map<String, Object> card = (Map<String, Object>) rawMap;
            Object efhubIdRaw = card.get("efhub_id");
            Object nameRaw = card.get("name");
            if (!(efhubIdRaw instanceof Number efhubNum)) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "har bir card'da efhub_id (number) bo'lishi shart");
            }
            if (!(nameRaw instanceof String nameStr) || nameStr.isBlank()) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "har bir card'da name (string) bo'lishi shart");
            }
            long efhubId = efhubNum.longValue();
            if (!seenIds.add(efhubId)) continue;
            // Deep-copy so upstream mutations don't leak into persisted state.
            Map<String, Object> copy = new HashMap<>(card);
            copy.put("efhub_id", efhubId);
            copy.put("name", nameStr.trim());
            normalized.add(copy);
        }
        return normalized;
    }

    private String validateEnum(AttributeDefinition def, Object raw) {
        if (!(raw instanceof String s)) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(), "ENUM matn kutilgan");
        }
        List<String> options = readStringListConstraint(def, "options");
        if (options == null || options.isEmpty()) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(),
                    "options ro'yxati sozlanmagan");
        }
        String value = s.strip();
        if (!options.contains(value)) {
            throw MarketplaceException.invalidAttributeValue(def.getKey(),
                    "options ichida topilmadi: " + options);
        }
        return value;
    }

    // ---------- constraint accessors ----------

    private Long readLongConstraint(AttributeDefinition def, String field) {
        JsonNode node = def.getConstraints() == null ? null : def.getConstraints().get(field);
        return (node == null || node.isNull()) ? null : node.asLong();
    }

    private BigDecimal readDecimalConstraint(AttributeDefinition def, String field) {
        JsonNode node = def.getConstraints() == null ? null : def.getConstraints().get(field);
        return (node == null || node.isNull()) ? null : new BigDecimal(node.asText());
    }

    private Integer readIntConstraint(AttributeDefinition def, String field) {
        Long v = readLongConstraint(def, field);
        return v == null ? null : v.intValue();
    }

    private String readStringConstraint(AttributeDefinition def, String field) {
        JsonNode node = def.getConstraints() == null ? null : def.getConstraints().get(field);
        return (node == null || node.isNull()) ? null : node.asText();
    }

    private List<String> readStringListConstraint(AttributeDefinition def, String field) {
        JsonNode node = def.getConstraints() == null ? null : def.getConstraints().get(field);
        if (node == null || !node.isArray()) return null;
        List<String> out = new ArrayList<>(node.size());
        node.forEach(e -> out.add(e.asText()));
        return out;
    }
}
