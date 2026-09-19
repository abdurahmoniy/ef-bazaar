package uz.efbazaar.trade.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.trade.domain.ParticipantRole;
import uz.efbazaar.trade.trade.domain.TradeMessage;
import uz.efbazaar.trade.trade.domain.TradeMessageType;
import uz.efbazaar.trade.trade.domain.TradeSenderType;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;

import java.util.Map;
import java.util.UUID;

/**
 * Konami kirish kodi keldi — oluvchi akkountga kirmoqchi bo'lganda.
 *
 * <p>Kod qutining EGASIGA emas, uni QABUL QILAYOTGAN tarafga kerak: sotuvda
 * bu xaridor, obmenda esa har biri boshqasining qutisidan kod oladi.
 * Shuning uchun qabul qiluvchi quti manzili bo'yicha aniqlanadi.
 *
 * <p>Holat o'zgarmaydi: kod shunchaki chatga STATUS xabar bo'lib tushadi va
 * tarafning qatoriga yoziladi — tasdiqlash tugmasi aynan shu belgiga qarab
 * ochiladi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class Imap2faCodeConsumer {

    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeBroadcaster broadcaster;
    private final uz.efbazaar.trade.trade.repository.TradeSideRepository sides;
    private final uz.efbazaar.trade.mailbox.repository.MailboxRepository mailboxes;

    @KafkaListener(
            topics = TradeEvents.TOPIC_IMAP_2FA,
            groupId = "trade-service-imap-2fa",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$Imap2faCode"}
    )
    public void onCode(TradeEvents.Imap2faCode e) {
        ParticipantRole recipient = recipientOf(e);
        var chat = chats.findByTradeIdAndParticipant(e.tradeId(), recipient);
        if (chat.isEmpty()) {
            log.warn("imap-2fa for trade {} with no {} chat", e.tradeId(), recipient);
            return;
        }
        sides.recordLoginCode(e.tradeId(), recipient, e.code(),
                e.receivedAt() != null ? e.receivedAt() : java.time.Instant.now());

        TradeMessage msg = TradeMessage.builder()
                .id(UUID.randomUUID())
                .tradeChatId(chat.get().getId())
                .senderType(TradeSenderType.SMART_ADMIN)
                .messageType(TradeMessageType.STATUS)
                .metadata(Map.of("code", "IMAP_2FA_CODE", "value", e.code()))
                .build();
        messages.save(msg);

        TradeMessageResponse resp = new TradeMessageResponse(msg.getId(), msg.getSenderType(),
                msg.getMessageType(), null, msg.getMetadata(), msg.getCreatedAt());
        broadcaster.publishMessage(e.tradeId(), recipient, resp);
    }

    /**
     * Kod qaysi tarafga tegishli.
     *
     * <p>Qutining egasi o'z akkountini o'sha quti orqali o'tkazgan; kirish
     * kodi esa akkountni OLAYOTGAN tarafga kerak. Manzil noma'lum bo'lsa
     * (eski hodisa) xaridor deb olinadi — sotuvda shunday.
     */
    private ParticipantRole recipientOf(TradeEvents.Imap2faCode e) {
        if (e.mailboxEmail() == null || e.mailboxEmail().isBlank()) {
            return ParticipantRole.BUYER;
        }
        return mailboxes.findByEmail(e.mailboxEmail())
                .flatMap(mb -> sides.findByIdTradeId(e.tradeId()).stream()
                        .filter(side -> mb.getId().equals(side.getMailboxId()))
                        .findFirst())
                .map(side -> side.role() == ParticipantRole.SELLER
                        ? ParticipantRole.BUYER : ParticipantRole.SELLER)
                .orElse(ParticipantRole.BUYER);
    }
}
