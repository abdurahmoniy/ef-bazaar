package uz.efbazaar.marketplace.support.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.support.service.SupportChatService;

@Slf4j
@Component
@RequiredArgsConstructor
public class SupportKafkaConsumer {

    private final SupportChatService supportChatService;

    @KafkaListener(
            topics = SupportEvents.TOPIC_SUPPORT_MESSAGE_BOUND,
            groupId = "marketplace-support-binder",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.support.kafka.SupportEvents$SupportMessageBoundEvent",
                    // Boshqa servis `__TypeId__` sarlavhasini qo\'yadi va
                    // undagi klass bizda YO\'Q — DTO mahalliy nusxa.
                    // Sarlavhaga ishonsak, xato poll() ichida yuz beradi:
                    // offset commit qilinmaydi va konteyner o\'sha xabarni
                    // cheksiz qayta o\'qiydi.
                    "spring.json.use.type.headers=false"
            }
    )
    public void onMessageBound(SupportEvents.SupportMessageBoundEvent event) {
        if (event == null) return;
        try {
            supportChatService.bindTelegramMessage(event.chatId(), event.messageId(), event.telegramMessageId());
            log.info("Bound telegram message id: chatId={} telegramMessageId={}",
                    event.chatId(), event.telegramMessageId());
        } catch (Exception ex) {
            log.error("Failed to bind telegram message: chatId={}", event.chatId(), ex);
        }
    }

    @KafkaListener(
            topics = SupportEvents.TOPIC_SUPPORT_REPLY_RECEIVED,
            groupId = "marketplace-support-replies",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.support.kafka.SupportEvents$SupportReplyReceivedEvent",
                    // Boshqa servis `__TypeId__` sarlavhasini qo\'yadi va
                    // undagi klass bizda YO\'Q — DTO mahalliy nusxa.
                    // Sarlavhaga ishonsak, xato poll() ichida yuz beradi:
                    // offset commit qilinmaydi va konteyner o\'sha xabarni
                    // cheksiz qayta o\'qiydi.
                    "spring.json.use.type.headers=false"
            }
    )
    public void onReplyReceived(SupportEvents.SupportReplyReceivedEvent event) {
        if (event == null) return;
        try {
            supportChatService.handleAdminReply(
                    event.replyToTelegramMessageId(),
                    event.telegramMessageId(),
                    event.adminName(),
                    event.adminUsername(),
                    event.text()
            );
            log.info("Processed admin reply: replyToTelegramMessageId={} telegramMessageId={}",
                    event.replyToTelegramMessageId(), event.telegramMessageId());
        } catch (Exception ex) {
            log.error("Failed to handle admin reply: replyToTelegramMessageId={}",
                    event.replyToTelegramMessageId(), ex);
        }
    }
}
