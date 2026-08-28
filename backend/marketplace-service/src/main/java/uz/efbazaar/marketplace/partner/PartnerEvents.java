package uz.efbazaar.marketplace.partner;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Hamkorlik oqimining Kafka hodisalari. */
public final class PartnerEvents {

    private PartnerEvents() {}

    public static final String TOPIC_APPLICATION_SUBMITTED = "efbazaar.marketplace.partner-application-submitted";
    public static final String TOPIC_APPROVED = "efbazaar.marketplace.partner-approved";
    public static final String TOPIC_REJECTED = "efbazaar.marketplace.partner-rejected";

    /**
     * To'lov o'tdi, ariza admin ko'rigini kutmoqda.
     *
     * <p>Adminlarning Telegram id lari hodisa ichida keladi. Bot rollar
     * haqida hech narsa bilmaydi va bilishi ham shart emas — kimga
     * yozishni marketplace hal qiladi, bot faqat yozadi.
     */
    public record ApplicationSubmitted(
            UUID applicationId,
            UUID userId,
            String channelTitle,
            String channelUsername,
            Integer subscriberCount,
            List<Long> adminTelegramIds,
            Instant occurredAt) {}

    public record PartnerApproved(UUID applicationId, UUID userId, Instant occurredAt) {}

    public record PartnerRejected(UUID applicationId, UUID userId, String note, Instant occurredAt) {}
}
