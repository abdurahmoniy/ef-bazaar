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

    private final uz.efbazaar.trade.trade.repository.TradeRepository trades;
    private final TradeEventPublisher events;
    private final ChatChangePublisher changes;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeBroadcaster broadcaster;
    private final uz.efbazaar.trade.trade.repository.TradeSideRepository sides;
    private final uz.efbazaar.trade.mailbox.repository.MailboxRepository mailboxes;

    @KafkaListener(
            topics = TradeEvents.TOPIC_IMAP_2FA,
            groupId = "trade-service-imap-2fa",
            properties = {"spring.json.value.default.type=uz.efbazaar.trade.kafka.TradeEvents$Imap2faCode",
                    "spring.json.use.type.headers=false"}
    )
    // Tranzaksiya SHART: kodni yozish @Modifying so'rovi orqali ketadi va
    // tranzaksiyasiz u "No EntityManager with actual transaction" bilan
    // yiqiladi — kod esa hech qachon tarafga yetib bormaydi.
    @org.springframework.transaction.annotation.Transactional
    public void onCode(TradeEvents.Imap2faCode e) {
        if (!KonamiOtpCode.isFresh(e.code(), e.receivedAt())) return;
        var trade = trades.findById(e.tradeId()).orElse(null);
        if (trade == null || trade.getState().isTerminal()) return;
        // An addressless legacy event is safe only for a sale's single mailbox.
        if ((e.mailboxEmail() == null || e.mailboxEmail().isBlank()) && trade.getKind().isSwap()) return;
        ParticipantRole recipient = recipientOf(e);
        if (recipient == null) return;
        var chat = chats.findByTradeIdAndParticipant(e.tradeId(), recipient);
        if (chat.isEmpty()) {
            log.warn("imap-2fa for trade {} with no {} chat", e.tradeId(), recipient);
            return;
        }
        if (sides.recordLoginCode(e.tradeId(), recipient, e.code(), e.receivedAt()) == 0) return;
        changes.publishForTrade(e.tradeId());
        if (trade.getState() == uz.efbazaar.trade.trade.domain.TradeState.WAITING_BUYER_VERIFY) {
            events.tradeAction(trade.getId(), trade.getChatId(),
                    recipient == ParticipantRole.SELLER ? trade.getSellerId() : trade.getBuyerId(),
                    TradeEvents.TradeActionType.LOGIN_CODE_RECEIVED, trade.getPriceUzs(),
                    e.code(), trade.getKind(), e.receivedAt());
        }

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
                .orElse(null);
    }
}
