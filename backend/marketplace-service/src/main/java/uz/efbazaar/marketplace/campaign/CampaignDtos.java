package uz.efbazaar.marketplace.campaign;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import uz.efbazaar.marketplace.campaign.CampaignRepositories.CampaignRepository.FunnelProjection;

import java.time.Instant;
import java.util.UUID;

public final class CampaignDtos {

    private CampaignDtos() {}

    public record CodeRequest(@NotBlank @Size(max = 32) String code) {}

    public record ClaimResponse(boolean claimed) {}

    public record CreateCampaignRequest(
            @NotBlank @Size(max = 120) String name,
            @NotNull Campaign.Kind kind) {}

    public record BotStartRequest(@NotNull Long telegramId, @NotBlank @Size(max = 32) String code) {}

    /** Adminka qatori: kampaniya va uning voronkasi. */
    public record CampaignRow(
            UUID id,
            String code,
            String name,
            String kind,
            Instant createdAt,
            Instant archivedAt,
            long clicks,
            long registrations,
            long listed,
            long sold) {

        static CampaignRow of(FunnelProjection p) {
            return new CampaignRow(p.getId(), p.getCode(), p.getName(), p.getKind(),
                    p.getCreatedAt(), p.getArchivedAt(),
                    p.getClicks(), p.getRegistrations(), p.getListed(), p.getSold());
        }

        static CampaignRow fresh(Campaign c) {
            return new CampaignRow(c.getId(), c.getCode(), c.getName(), c.getKind(),
                    c.getCreatedAt(), c.getArchivedAt(), 0, 0, 0, 0);
        }
    }
}
