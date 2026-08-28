package uz.efbazaar.marketplace.botsettings;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import uz.efbazaar.marketplace.botsettings.BotBroadcast.Audience;
import uz.efbazaar.marketplace.botsettings.BotBroadcast.InlineButton;
import uz.efbazaar.marketplace.botsettings.BotBroadcast.Status;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class BotBroadcastDtos {

    private BotBroadcastDtos() {}

    /** Adminka yuboradigan qoralama. Banner alohida multipart qism sifatida keladi. */
    public record CreateBroadcastRequest(
            @NotBlank(message = "Matn bo'sh bo'lmasligi kerak")
            @Size(max = 4096, message = "Matn juda uzun")
            String messageText,

            @Size(max = 10, message = "Tugmalar 10 qatordan oshmasligi kerak")
            List<@Size(max = 3, message = "Bir qatorda 3 tadan ko'p tugma bo'lmaydi")
                    List<@Valid ButtonDto>> buttons,

            /** Bo'sh bo'lsa {@link Audience#ALL} — adminka har doim yuboradi. */
            Audience audience
    ) {}

    public record ButtonDto(
            @NotBlank @Size(max = 32) String text,
            @NotBlank @Size(max = 2048) String url
    ) {
        public InlineButton toDomain() {
            return new InlineButton(text.trim(), url.trim());
        }
    }

    /**
     * Botdan keladigan progress. Sonlar ALMASHTIRILADI, qo'shilmaydi —
     * bot har safar o'zining joriy jamisini yuboradi, shuning uchun
     * takroriy yoki kechikkan xabar hisobni buzmaydi.
     */
    public record BroadcastProgressRequest(
            @NotNull Status status,
            @Min(0) int totalRecipients,
            @Min(0) int sentCount,
            @Min(0) int failedCount,
            @Min(0) int blockedCount,
            String errorMessage
    ) {}

    public record BroadcastResponse(
            UUID id,
            String messageText,
            String bannerFileId,
            List<List<InlineButton>> buttons,
            Status status,
            Audience audience,
            int totalRecipients,
            int sentCount,
            int failedCount,
            int blockedCount,
            Instant createdAt,
            Instant startedAt,
            Instant finishedAt,
            String errorMessage
    ) {
        public static BroadcastResponse from(BotBroadcast b) {
            return new BroadcastResponse(
                    b.getId(), b.getMessageText(), b.getBannerFileId(), b.getButtons(),
                    b.getStatus(), b.getAudience(), b.getTotalRecipients(), b.getSentCount(),
                    b.getFailedCount(), b.getBlockedCount(),
                    b.getCreatedAt(), b.getStartedAt(), b.getFinishedAt(), b.getErrorMessage());
        }
    }
}
