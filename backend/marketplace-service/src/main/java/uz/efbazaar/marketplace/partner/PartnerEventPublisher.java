package uz.efbazaar.marketplace.partner;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import uz.efbazaar.marketplace.security.AuthAdminClient;
import uz.efbazaar.marketplace.security.AuthAdminClient.AdminSummary;
import uz.efbazaar.marketplace.security.AuthSummaryClient;
import uz.efbazaar.marketplace.security.AuthSummaryClient.UserSummary;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

/**
 * Hamkorlik hodisalarini chiqaradi.
 *
 * <p>Hammasi TRANZAKSIYA YAKUNLANGANDAN KEYIN ketadi. Aks holda hodisani
 * eshitgan servis arizani o'qishga urinib eski holatni ko'rardi: masalan
 * auth rolni berishga urinar, ariza esa hali APPROVED bo'lib commit
 * qilinmagan bo'lardi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartnerEventPublisher {

    private final KafkaTemplate<String, Object> kafka;
    private final AuthAdminClient admins;
    private final AuthSummaryClient users;

    public void applicationAwaitingReview(PartnerApplication a) {
        // Adminlarning manzillari SHU YERDA yechiladi: bot rollarni bilmaydi
        // va bilishi ham shart emas.
        List<Long> telegramIds = admins.admins().stream()
                .map(AdminSummary::telegramId)
                .filter(Objects::nonNull)
                .toList();
        if (telegramIds.isEmpty()) {
            log.warn("Ariza {} ko'rikni kutmoqda, lekin Telegramli admin topilmadi", a.getId());
        }
        send(PartnerEvents.TOPIC_APPLICATION_SUBMITTED, a.getId().toString(),
                new PartnerEvents.ApplicationSubmitted(
                        a.getId(), a.getUserId(), a.getChannelTitle(), a.getChannelUsername(),
                        a.getSubscriberCount(), telegramIds, Instant.now()));
    }

    public void applicationApproved(PartnerApplication a) {
        send(PartnerEvents.TOPIC_APPROVED, a.getUserId().toString(),
                new PartnerEvents.PartnerApproved(a.getId(), a.getUserId(),
                        telegramIdOf(a.getUserId()), Instant.now()));
    }

    public void applicationRejected(PartnerApplication a) {
        send(PartnerEvents.TOPIC_REJECTED, a.getUserId().toString(),
                new PartnerEvents.PartnerRejected(a.getId(), a.getUserId(), a.getReviewNote(),
                        telegramIdOf(a.getUserId()), Instant.now()));
    }

    public void applicationCancelled(PartnerApplication a, boolean bySelf) {
        send(PartnerEvents.TOPIC_CANCELLED, a.getUserId().toString(),
                new PartnerEvents.PartnerCancelled(a.getId(), a.getUserId(),
                        a.getCancelReason(), bySelf,
                        // O'zi to'xtatgan bo'lsa DM ketmaydi — manzilni
                        // yechish uchun auth'ni bezovta qilishning ham
                        // hojati yo'q.
                        bySelf ? null : telegramIdOf(a.getUserId()), Instant.now()));
    }

    /**
     * Arizachining Telegram manzili — SHU YERDA yechiladi, adminlarniki
     * kabi. Bot auth-service'ga murojaat qila olmaydi va foydalanuvchi
     * identifikatorlarini bilmaydi.
     *
     * <p>Null bo'lishi mumkin: Telegram orqali kirmagan odamda manzil
     * yo'q. Bunda DM ketmaydi, platforma bildirishnomasi esa baribir
     * yoziladi — u boshqa yo'ldan boradi.
     */
    private Long telegramIdOf(java.util.UUID userId) {
        try {
            return users.resolve(userId).map(UserSummary::telegramId).orElse(null);
        } catch (RuntimeException e) {
            // Manzil topilmagani qarorni bekor qilmaydi: hamkorlik
            // allaqachon tasdiqlangan va hodisa rol berish uchun ham
            // kerak. DM'siz qolgani xabarsiz qolgandan yaxshi.
            log.warn("Arizachi {} ning Telegram manzili yechilmadi: {}", userId, e.getMessage());
            return null;
        }
    }

    private void send(String topic, String key, Object event) {
        afterCommit(() -> kafka.send(topic, key, event)
                .whenComplete((r, ex) -> {
                    if (ex != null) log.error("Failed to publish to {} key={}: {}", topic, key, ex.getMessage());
                    else log.debug("Published to {} key={}", topic, key);
                }));
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
