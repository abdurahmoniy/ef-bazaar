package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.marketplace.partner.PartnerChannel;

import java.time.Instant;
import java.util.UUID;

/** Botga kanal bo'yicha topshiriqlarni uzatadi: post chiqarish va yangilash. */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartnerAdEventPublisher {

    public static final String TOPIC_CHANNEL_POST_REQUESTED =
            "efbazaar.marketplace.channel-post-requested";
    public static final String TOPIC_CHANNEL_REFRESH_REQUESTED =
            "efbazaar.marketplace.channel-refresh-requested";
    public static final String TOPIC_CHANNEL_POST_DELETE_REQUESTED =
            "efbazaar.marketplace.channel-post-delete-requested";
    public static final String TOPIC_OFFICIAL_POST_REQUESTED =
            "efbazaar.marketplace.official-post-requested";
    public static final String TOPIC_POST_EDIT_REQUESTED =
            "efbazaar.marketplace.channel-post-edit-requested";

    private final KafkaTemplate<String, Object> kafka;

    public void postRequested(ListingChannelPost post, ChannelPostPayload payload) {
        send(TOPIC_CHANNEL_POST_REQUESTED, post.getId().toString(), payload);
    }

    /**
     * "Shu kanalni Telegram'dan qayta o'qi" — kunlik yangilanish.
     *
     * <p>Kalit sifatida KANAL identifikatori: bir kanalning topshiriqlari
     * bitta bo'limga tushadi va navbatda o'zaro almashib ketmaydi.
     */
    public void refreshRequested(PartnerChannel channel) {
        send(TOPIC_CHANNEL_REFRESH_REQUESTED, channel.getId().toString(),
                new ChannelRefreshPayload(channel.getId(),
                        channel.getTelegramChannelId(), Instant.now()));
    }

    /**
     * "Shu xabarni kanaldan o'chir" — e'lon qayta yuborilgani uchun.
     *
     * <p>Obunachi bir xil e'lonni ikki marta ko'rmasin va pastda
     * eskirgan narx bilan turgan postga tushib qolmasin.
     */
    public void postDeleteRequested(ListingChannelPost post, PartnerChannel channel) {
        send(TOPIC_CHANNEL_POST_DELETE_REQUESTED, post.getId().toString(),
                new ChannelPostDeletePayload(post.getId(), channel.getTelegramChannelId(),
                        String.valueOf(channel.getTelegramChannelId()),
                        post.getTelegramMessageId(), Instant.now()));
    }

    /**
     * "Shu xabarni rasmiy kanaldan o'chir" — e'lon olib tashlangani uchun.
     *
     * <p>Alohida metod, chunki rasmiy kanal sozlamada MATN bo'lib turadi
     * (@username ham bo'lishi mumkin), hamkor kanali esa raqamli
     * identifikator. Bitta payload ikkalasini ham olib yuradi:
     * {@code chatId} — bot ishlatadigan qiymat, {@code telegramChannelId}
     * esa eski bot versiyalari uchun qolgan.
     */
    public void officialPostDeleteRequested(UUID listingId, String officialChannel,
                                            String telegramMessageId) {
        send(TOPIC_CHANNEL_POST_DELETE_REQUESTED, officialChannel + ":" + telegramMessageId,
                new ChannelPostDeletePayload(listingId, null, officialChannel,
                        telegramMessageId, Instant.now()));
    }

    /**
     * E'lonni efBazaar rasmiy kanaliga chiqarish.
     *
     * <p>Ikki yo'l bitta payloadda: {@code sourceMessageId} to'ldirilgan
     * bo'lsa FORWARD, aks holda to'g'ridan-to'g'ri joylash. Ikki mavzu
     * ochish bot tarafida bir xil ishni ikki joyda yozishga majbur
     * qilardi — natija ham, xatolik yo'li ham bitta.
     */
    public void officialPostRequested(OfficialPostPayload payload) {
        send(TOPIC_OFFICIAL_POST_REQUESTED, payload.listingId().toString(), payload);
    }

    /**
     * Chiqib bo'lgan postning matnini almashtirish — sotilgan e'lon uchun.
     *
     * <p>Kalit sifatida KANAL+XABAR: bir e'lonning turli kanallardagi
     * nusxalari mustaqil va biri yiqilsa qolganlari to'xtamasligi kerak.
     */
    public void postEditRequested(PostEditPayload payload) {
        send(TOPIC_POST_EDIT_REQUESTED,
                payload.chatId() + ":" + payload.telegramMessageId(), payload);
    }

    public record PostEditPayload(String chatId, String telegramMessageId, String html) {}

    public record OfficialPostPayload(
            UUID listingId,
            String officialChannel,
            String caption,
            String mediaFileId,
            String buttonUrl,
            Long sourceChannelId,
            String sourceMessageId) {}

    /**
     * @param telegramChannelId hamkor kanalining raqamli identifikatori, rasmiy
     *                          kanal uchun null. Eski bot versiyalari faqat
     *                          shuni o'qiydi, shuning uchun olib tashlanmadi.
     * @param chatId            bot aslida ishlatadigan qiymat: raqam ham,
     *                          {@code @username} ham bo'lishi mumkin.
     */
    public record ChannelPostDeletePayload(
            UUID postId,
            Long telegramChannelId,
            String chatId,
            String telegramMessageId,
            Instant occurredAt) {}

    public record ChannelRefreshPayload(
            UUID partnerChannelId,
            Long telegramChannelId,
            Instant occurredAt) {}

    /**
     * @param mediaMessageId Telegram {@code file_id}. Nomi yanglishtiradi —
     *                       {@code Listing.mediaMessageIds} aslida yuklangan
     *                       fayl identifikatorlarini saqlaydi, message_id
     *                       larni emas.
     */
    public record ChannelPostPayload(
            UUID postId,
            UUID listingId,
            Long telegramChannelId,
            String caption,
            String mediaMessageId,
            String buttonUrl,
            Instant occurredAt) {

        public static ChannelPostPayload of(ListingChannelPost post, PartnerChannel channel,
                                            String caption, String mediaMessageId, String buttonUrl) {
            return new ChannelPostPayload(post.getId(), post.getListingId(),
                    channel.getTelegramChannelId(), caption, mediaMessageId, buttonUrl, Instant.now());
        }
    }

    /**
     * Tranzaksiya ichida chaqirilsa COMMIT'dan keyin yuboriladi.
     *
     * <p>Aks holda bot postni chiqarib yuborar, tranzaksiya esa orqaga
     * qaytib, chiqqan postga mos qator qolmasdi.
     */
    private void send(String topic, String key, Object payload) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            doSend(topic, key, payload);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() { doSend(topic, key, payload); }
        });
    }

    private void doSend(String topic, String key, Object payload) {
        kafka.send(topic, key, payload)
                .whenComplete((result, error) -> {
                    if (error != null) {
                        log.error("Kanal so'rovi yuborilmadi (mavzu={} kalit={})", topic, key, error);
                    }
                });
    }
}
