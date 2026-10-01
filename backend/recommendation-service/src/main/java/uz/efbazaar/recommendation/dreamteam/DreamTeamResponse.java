package uz.efbazaar.recommendation.dreamteam;


import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

public record DreamTeamResponse(
        UUID id,
        String name,
        String formation,
        List<Map<String, Object>> slots,
        Instant createdAt,
        Instant updatedAt
) {
    public static DreamTeamResponse from(DreamTeam team) {
        return new DreamTeamResponse(
                team.getId(),
                team.getName(),
                team.getFormation(),
                team.getSlots(),
                team.getCreatedAt(),
                team.getUpdatedAt());
    }
}
