package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.DreamTeam;
import uz.efbazaar.marketplace.dto.DreamTeamRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.DreamTeamRepository;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.HashSet;

@Service
@RequiredArgsConstructor
public class DreamTeamService {

    /** Enough for "my squad" plus a few experiments; stops the table growing per-click. */
    private static final int MAX_TEAMS_PER_USER = 10;
    private static final String DEFAULT_FORMATION = "4-3-3";
    private static final Map<String, List<String>> FORMATIONS = Map.of(
            "4-3-3", List.of("GK", "LB", "CB", "CB", "RB", "CMF", "DMF", "CMF", "LWF", "CF", "RWF"),
            "4-2-3-1", List.of("GK", "LB", "CB", "CB", "RB", "DMF", "DMF", "LMF", "AMF", "RMF", "CF"),
            "3-5-2", List.of("GK", "CB", "CB", "CB", "LMF", "CMF", "DMF", "CMF", "RMF", "CF", "CF"));

    private final DreamTeamRepository repository;
    private final CardIdentityVerifier identities;

    @Transactional(readOnly = true)
    public List<DreamTeam> findMine(UUID userId) {
        return repository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    @Transactional(readOnly = true)
    public DreamTeam get(UUID id, UUID userId) {
        return repository.findByIdAndUserId(id, userId)
                .orElseThrow(DreamTeamService::notFound);
    }

    @Transactional
    public DreamTeam create(UUID userId, DreamTeamRequest request) {
        if (repository.countByUserId(userId) >= MAX_TEAMS_PER_USER) {
            throw new MarketplaceException(HttpStatus.CONFLICT, "dream_team_limit",
                    "Ko'pi bilan " + MAX_TEAMS_PER_USER + " ta jamoa saqlash mumkin");
        }
        String formation = formationOf(request);
        DreamTeam team = DreamTeam.builder()
                .userId(userId)
                .name(request.name().trim())
                .formation(formation)
                .slots(slotsOf(request, formation))
                .build();
        return repository.save(team);
    }

    @Transactional
    public DreamTeam update(UUID id, UUID userId, DreamTeamRequest request) {
        DreamTeam team = get(id, userId);
        team.setName(request.name().trim());
        String formation = formationOf(request);
        team.setFormation(formation);
        team.setSlots(slotsOf(request, formation));
        return repository.save(team);
    }

    @Transactional
    public void delete(UUID id, UUID userId) {
        repository.delete(get(id, userId));
    }

    private static String formationOf(DreamTeamRequest request) {
        String formation = request.formation() == null || request.formation().isBlank()
                ? DEFAULT_FORMATION
                : request.formation().trim();
        if (!FORMATIONS.containsKey(formation)) {
            throw invalid("formatsiya qo'llab-quvvatlanmaydi");
        }
        return formation;
    }

    private List<Map<String, Object>> slotsOf(DreamTeamRequest request, String formation) {
        if (request.slots() == null || request.slots().isEmpty()) {
            return new ArrayList<>();
        }

        List<String> positions = FORMATIONS.get(formation);
        Set<Integer> indexes = new HashSet<>();
        Set<UUID> playerIds = new HashSet<>();
        List<CardIdentityVerifier.Claim> claims = new ArrayList<>();
        List<Map<String, Object>> normalized = new ArrayList<>(request.slots().size());

        for (Map<String, Object> rawSlot : request.slots()) {
            if (rawSlot == null) {
                throw invalid("slot bo'sh bo'lmasin");
            }
            int index = integer(rawSlot.get("index"), "slot index");
            if (index < 0 || index >= positions.size() || !indexes.add(index)) {
                throw invalid("slot index noto'g'ri yoki takrorlangan");
            }
            int weight = rawSlot.get("w") == null ? 1 : integer(rawSlot.get("w"), "vazn");
            if (weight != 1 && weight != 3) {
                throw invalid("vazn faqat 1 yoki 3 bo'lishi mumkin");
            }
            Object rawCard = rawSlot.get("card");
            if (!(rawCard instanceof Map<?, ?> card)) {
                throw invalid("slot card obyektini saqlashi kerak");
            }
            long efhubId = positiveLong(card.get("efhubId"), "efhubId");
            UUID playerId = uuid(card.get("playerId"), "playerId");
            if (!playerIds.add(playerId)) {
                throw invalid("bir o'yinchi takror tanlangan");
            }

            LinkedHashMap<String, Object> normalizedCard = new LinkedHashMap<>();
            card.forEach((key, value) -> {
                if (key instanceof String stringKey) normalizedCard.put(stringKey, value);
            });
            normalizedCard.put("efhubId", efhubId);
            normalizedCard.put("playerId", playerId.toString());

            LinkedHashMap<String, Object> slot = new LinkedHashMap<>();
            slot.put("index", index);
            slot.put("position", positions.get(index));
            slot.put("w", weight);
            slot.put("card", normalizedCard);
            normalized.add(slot);
            claims.add(new CardIdentityVerifier.Claim(efhubId, playerId));
        }

        identities.verify(claims);
        normalized.sort(java.util.Comparator.comparingInt(slot -> (Integer) slot.get("index")));
        return normalized;
    }

    private static int integer(Object raw, String field) {
        if (raw instanceof Number number) {
            long value = number.longValue();
            if (value >= Integer.MIN_VALUE && value <= Integer.MAX_VALUE
                    && number.doubleValue() == (double) value) {
                return (int) value;
            }
        }
        throw invalid(field + " butun son bo'lishi kerak");
    }

    private static long positiveLong(Object raw, String field) {
        if (raw instanceof Number number) {
            long value = number.longValue();
            if (value > 0 && number.doubleValue() == (double) value) return value;
        }
        throw invalid(field + " musbat butun son bo'lishi kerak");
    }

    private static UUID uuid(Object raw, String field) {
        if (raw instanceof String value) {
            try {
                return UUID.fromString(value);
            } catch (IllegalArgumentException ignored) {
                // Stable validation error below.
            }
        }
        throw invalid(field + " haqiqiy UUID bo'lishi kerak");
    }

    private static MarketplaceException invalid(String reason) {
        return new MarketplaceException(HttpStatus.BAD_REQUEST, "invalid_dream_team",
                "Jamoa noto'g'ri: " + reason);
    }

    private static MarketplaceException notFound() {
        return new MarketplaceException(HttpStatus.NOT_FOUND, "dream_team_not_found",
                "Jamoa topilmadi");
    }
}
