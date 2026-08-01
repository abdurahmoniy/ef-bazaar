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
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DreamTeamService {

    /** Enough for "my squad" plus a few experiments; stops the table growing per-click. */
    private static final int MAX_TEAMS_PER_USER = 10;
    private static final String DEFAULT_FORMATION = "4-3-3";

    private final DreamTeamRepository repository;

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
        DreamTeam team = DreamTeam.builder()
                .userId(userId)
                .name(request.name().trim())
                .formation(formationOf(request))
                .slots(slotsOf(request))
                .build();
        return repository.save(team);
    }

    @Transactional
    public DreamTeam update(UUID id, UUID userId, DreamTeamRequest request) {
        DreamTeam team = get(id, userId);
        team.setName(request.name().trim());
        team.setFormation(formationOf(request));
        team.setSlots(slotsOf(request));
        return repository.save(team);
    }

    @Transactional
    public void delete(UUID id, UUID userId) {
        repository.delete(get(id, userId));
    }

    private static String formationOf(DreamTeamRequest request) {
        return request.formation() == null || request.formation().isBlank()
                ? DEFAULT_FORMATION
                : request.formation().trim();
    }

    private static List<java.util.Map<String, Object>> slotsOf(DreamTeamRequest request) {
        return request.slots() == null ? new ArrayList<>() : new ArrayList<>(request.slots());
    }

    private static MarketplaceException notFound() {
        return new MarketplaceException(HttpStatus.NOT_FOUND, "dream_team_not_found",
                "Jamoa topilmadi");
    }
}
