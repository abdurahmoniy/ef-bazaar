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
import java.util.UUID;
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
    private final CardIdentityVerifier cardIdentities;

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
                if ("android_coins".equals(def.getKey()) || "ios_coins".equals(def.getKey())) {
                    normalized.put(def.getKey(), 0L);
                }
                continue;
            }
            normalized.put(def.getKey(), coerceAndCheck(def, raw));
        }

        return normalized;
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
        // Separate floor from `min`: the value itself is legal (a seller may
        // genuinely have 0 device transfers left this month) but the account
        // cannot be traded, so it earns its own error code + message.
        Long minSellable = readLongConstraint(def, "min_sellable");
        if (minSellable != null && n < minSellable) {
            throw MarketplaceException.attributeBelowSellableMinimum(def.getLabelUz(), minSellable, n);
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
     * change. Card-edition and canonical-player duplicates are rejected.
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
        Set<UUID> seenPlayers = new HashSet<>();
        List<CardIdentityVerifier.Claim> claims = new ArrayList<>(list.size());
        for (Object item : list) {
            if (!(item instanceof Map<?, ?> rawMap)) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "har bir element obyekt bo'lishi kerak");
            }
            Map<String, Object> card = (Map<String, Object>) rawMap;
            Object efhubIdRaw = card.get("efhub_id");
            Object playerIdRaw = card.get("player_id");
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
            UUID playerId;
            try {
                playerId = playerIdRaw instanceof UUID uuid
                        ? uuid
                        : UUID.fromString(String.valueOf(playerIdRaw));
            } catch (IllegalArgumentException e) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "har bir card'da player_id (UUID) bo'lishi shart");
            }
            if (!seenIds.add(efhubId)) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "takrorlangan efhub_id: " + efhubId);
            }
            if (!seenPlayers.add(playerId)) {
                throw MarketplaceException.invalidAttributeValue(def.getKey(),
                        "takrorlangan player_id: " + playerId);
            }
            // Deep-copy so upstream mutations don't leak into persisted state.
            Map<String, Object> copy = new HashMap<>(card);
            copy.put("efhub_id", efhubId);
            copy.put("player_id", playerId.toString());
            copy.put("name", nameStr.trim());
            normalized.add(copy);
            claims.add(new CardIdentityVerifier.Claim(efhubId, playerId));
        }
        cardIdentities.verify(claims);
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
