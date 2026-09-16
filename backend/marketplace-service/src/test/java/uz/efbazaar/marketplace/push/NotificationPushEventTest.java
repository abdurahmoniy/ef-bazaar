package uz.efbazaar.marketplace.push;

import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.domain.Notification;
import uz.efbazaar.marketplace.domain.NotificationType;
import java.util.UUID;
import static org.assertj.core.api.Assertions.*;

class NotificationPushEventTest {
    @Test void snapshotsIdentityAndUsesMatchingChatDestination() {
        var n = Notification.builder().id(UUID.randomUUID()).userId(UUID.randomUUID())
                .type(NotificationType.CHAT_MESSAGE).chatId(UUID.randomUUID()).actorDisplayName("Ali").build();
        var event = NotificationPushEvent.from(n);
        assertThat(event.data()).containsEntry("notificationId", n.getId().toString())
                .containsEntry("recipientUserId", n.getUserId().toString())
                .containsEntry("url", "/chats/" + n.getChatId()).containsEntry("title", "efBazaar")
                .containsEntry("body", "Ali sizga xabar yozdi");
        n.setUserId(UUID.randomUUID());
        assertThat(event.recipientUserId().toString()).isEqualTo(event.data().get("recipientUserId"));
    }
    @Test void everyTypeHasBoundedTextAndRelativeSameOriginUrl() {
        for (var type : NotificationType.values()) {
            var event = NotificationPushEvent.from(Notification.builder().id(UUID.randomUUID())
                    .userId(UUID.randomUUID()).type(type).actorDisplayName("x".repeat(4000)).build());
            assertThat(event.data().get("url")).startsWith("/").doesNotStartWith("//");
            assertThat(event.data().get("body")).isNotBlank().hasSizeLessThan(300);
        }
    }
    @Test void specialRoutesMatchNotificationCenterAndWebmailFallsBackSafely() {
        assertThat(url(NotificationType.WALLET_CREDITED)).isEqualTo("/hamyon");
        assertThat(url(NotificationType.WITHDRAWAL_PAID)).isEqualTo("/hamyon");
        assertThat(url(NotificationType.PARTNER_APPROVED)).isEqualTo("/partner");
        assertThat(url(NotificationType.PARTNER_REJECTED)).isEqualTo("/partnership");
        assertThat(url(NotificationType.TRADE_MAILBOX_RECEIVED)).isEqualTo("/notifications");
    }
    private String url(NotificationType type) {
        return NotificationPushEvent.from(Notification.builder().id(UUID.randomUUID())
                .userId(UUID.randomUUID()).type(type).build()).data().get("url");
    }
}
