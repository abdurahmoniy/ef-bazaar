package uz.efbazaar.marketplace.popup;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class PopupDtos {
    private PopupDtos() {}

    public enum Tone { INFO, SUCCESS, WARNING }
    public enum Audience { ALL, SELLERS, SELECTED }
    public enum Trigger { BROWSE, LISTING_PUBLISHED, EMPTY_SEARCH, TRADE_COMPLETED }
    public enum Status { DRAFT, ACTIVE, PAUSED }
    public enum Event { SHOWN, DISMISSED, CLICKED }

    public record CreateCampaign(
            @NotBlank @Size(max = 100) String title,
            @NotBlank @Size(max = 600) String message,
            @NotNull Tone tone,
            @NotNull Audience audience,
            @Size(max = 100) List<@NotNull UUID> recipientIds,
            @NotNull Trigger trigger,
            @Size(max = 60) String actionLabel,
            @Size(max = 200) String actionPath,
            @NotNull Instant startsAt,
            @NotNull Instant endsAt,
            @NotNull @Min(0) @Max(10) Integer priority
    ) {}

    public record UpdateStatus(@NotNull Status status) {}
    public record Claim(@NotNull Trigger trigger, @NotNull UUID sessionId) {}
    public record RecordEvent(@NotNull Event event) {}
    public record Delivery(UUID deliveryId, PublicCampaign campaign) {}

    /** Recipients and creator identity are never exposed by the user-facing API. */
    public record PublicCampaign(UUID id, String title, String message, Tone tone, Trigger trigger,
                                 String actionLabel, String actionPath, Instant endsAt) {
        static PublicCampaign of(Campaign campaign) {
            return new PublicCampaign(campaign.id(), campaign.title(), campaign.message(), campaign.tone(),
                    campaign.trigger(), campaign.actionLabel(), campaign.actionPath(), campaign.endsAt());
        }
    }

    public record Campaign(UUID id, String title, String message, Tone tone, Audience audience,
                           List<UUID> recipientIds, Trigger trigger, String actionLabel, String actionPath,
                           Instant startsAt, Instant endsAt, int priority, Status status,
                           Instant createdAt, UUID createdBy, long shownCount, long clickedCount, long dismissedCount) {}
}
