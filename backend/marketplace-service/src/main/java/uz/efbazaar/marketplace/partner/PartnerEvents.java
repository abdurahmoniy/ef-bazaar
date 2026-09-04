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
    public static final String TOPIC_CANCELLED = "efbazaar.marketplace.partner-cancelled";

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

    /**
     * Qaror qabul qilindi.
     *
     * <p>{@code recipientTelegramId} — arizachining o'zi, adminlar emas.
     * Bot foydalanuvchi identifikatorlari haqida hech narsa bilmaydi va
     * auth-service'ga murojaat qila olmaydi, shuning uchun kimga
     * yozishni marketplace hal qilib beradi. Telegram orqali kirmagan
     * odamda bu null bo'ladi — bunda DM ketmaydi, platforma
     * bildirishnomasi esa baribir yoziladi.
     */
    public record PartnerApproved(UUID applicationId, UUID userId,
                                  Long recipientTelegramId, Instant occurredAt) {}

    public record PartnerRejected(UUID applicationId, UUID userId, String note,
                                  Long recipientTelegramId, Instant occurredAt) {}

    /**
     * Hamkorlik to'xtatildi — auth PARTNER rolini olib tashlashi kerak.
     *
     * <p>{@code bySelf} — hamkorning o'zi to'xtatdimi. Shunda xabar
     * yuborilmaydi: odam hozirgina tasdiqlash oynasini bosgan va
     * "hamkorligingiz to'xtatildi" degan xabar aynan shu turdagi
     * shovqin, odamni bildirishnomalarni umuman o'qimaslikka
     * o'rgatadigan. Admin to'xtatgan yoki bot kanaldan chiqarilgan
     * bo'lsa esa xabar SHART: bundan odamning o'zi bexabar.
     */
    public record PartnerCancelled(UUID applicationId, UUID userId, String reason,
                                   boolean bySelf, Long recipientTelegramId,
                                   Instant occurredAt) {}
}
