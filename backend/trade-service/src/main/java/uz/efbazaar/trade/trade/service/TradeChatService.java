package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.service.TradeIdleWatchdog;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;
import uz.efbazaar.trade.trade.ws.TradeBroadcaster;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TradeChatService {

    private final TradeService trades;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeCrypto crypto;
    private final TradeBroadcaster broadcaster;
    private final TradeIdleWatchdog idleWatchdog;

    /** Party form — writes into the caller's own chat. */
    @Transactional
    public TradeMessage postText(UUID tradeId, UUID viewerUserId, String text) {
        return postTextAs(tradeId, viewerUserId, null, text);
    }

    /**
     * Viewer-aware post. A party always writes to their own chat and
     * {@code target} is ignored; the assigned admin must name a target.
     */
    @Transactional
    public TradeMessage postTextAs(UUID tradeId, UUID senderUserId,
                                   ParticipantRole target, String text) {
        Trade t = trades.getForViewer(tradeId, senderUserId);
        if (t.getState().isTerminal()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Trade is closed — no new messages allowed");
        }
        TradeViewer viewer = t.viewerFor(senderUserId);

        ParticipantRole chatRole;
        TradeSenderType senderType;
        if (viewer == TradeViewer.ADMIN) {
            if (target == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Qaysi chatga yozilayotganini ko'rsating: SELLER yoki BUYER");
            }
            chatRole = target;
            senderType = TradeSenderType.HUMAN_ADMIN;
        } else {
            chatRole = viewer.asParticipantRole();
            senderType = TradeSenderType.USER;
        }

        var chat = chats.findByTradeIdAndParticipant(tradeId, chatRole)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + chatRole));

        UUID messageId = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt(
                context(tradeId, messageId),
                text.getBytes(StandardCharsets.UTF_8));

        TradeMessage msg = TradeMessage.builder()
                .id(messageId)
                .tradeChatId(chat.getId())
                .senderType(senderType)
                .messageType(TradeMessageType.TEXT)
                .encryptedBody(enc.ciphertext())
                .iv(enc.iv())
                .tag(enc.tag())
                .build();
        messages.save(msg);

        TradeMessageResponse resp = new TradeMessageResponse(msg.getId(), msg.getSenderType(),
                msg.getMessageType(), text, msg.getMetadata(), msg.getCreatedAt());
        broadcaster.publishMessage(tradeId, chatRole, resp);

        if (viewer == TradeViewer.ADMIN) {
            // Talking to a party is work even before any step is ticked (§7.2).
            idleWatchdog.touch(t);
        }

        return msg;
    }

    /** Party form — reads the caller's own chat. */
    @Transactional(readOnly = true)
    public List<TradeMessageResponse> list(UUID tradeId, UUID viewerUserId) {
        return listFor(tradeId, viewerUserId, null);
    }

    /** Viewer-aware read. The admin may name either chat; a party may not. */
    @Transactional(readOnly = true)
    public List<TradeMessageResponse> listFor(UUID tradeId, UUID viewerUserId,
                                             ParticipantRole target) {
        Trade t = trades.getForViewer(tradeId, viewerUserId);
        TradeViewer viewer = t.viewerFor(viewerUserId);

        ParticipantRole chatRole;
        if (viewer == TradeViewer.ADMIN) {
            if (target == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Qaysi chat o'qilayotganini ko'rsating: SELLER yoki BUYER");
            }
            chatRole = target;
        } else {
            chatRole = viewer.asParticipantRole();
        }

        var chat = chats.findByTradeIdAndParticipant(tradeId, chatRole)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + chatRole));

        return messages.findByTradeChatIdOrderByCreatedAtAsc(chat.getId()).stream()
                .map(m -> new TradeMessageResponse(
                        m.getId(),
                        m.getSenderType(),
                        m.getMessageType(),
                        m.getMessageType() == TradeMessageType.TEXT
                                ? decryptText(tradeId, m)
                                : null,
                        m.getMetadata(),
                        m.getCreatedAt()))
                .toList();
    }

    private String decryptText(UUID tradeId, TradeMessage m) {
        byte[] plain = crypto.decrypt(context(tradeId, m.getId()),
                new EncryptedField(m.getIv(), m.getTag(), m.getEncryptedBody()));
        return new String(plain, StandardCharsets.UTF_8);
    }

    private static String context(UUID tradeId, UUID messageId) {
        return "msg-" + tradeId + "-" + messageId;
    }

    /**
     * System status note in one party's chat. STATUS rows carry no encrypted
     * body — V5's body-shape CHECK permits all-null — so the code and metadata
     * carry the meaning and the client renders the label.
     */
    @Transactional
    public TradeMessage postStatus(UUID tradeId, ParticipantRole target,
                                   String code, Map<String, Object> metadata) {
        var chat = chats.findByTradeIdAndParticipant(tradeId, target)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + target));

        Map<String, Object> meta = new LinkedHashMap<>();
        meta.put("code", code);
        if (metadata != null) meta.putAll(metadata);

        TradeMessage msg = TradeMessage.builder()
                .id(UUID.randomUUID())
                .tradeChatId(chat.getId())
                .senderType(TradeSenderType.SYSTEM)
                .messageType(TradeMessageType.STATUS)
                .metadata(meta)
                .build();
        messages.save(msg);

        broadcaster.publishMessage(tradeId, target, new TradeMessageResponse(
                msg.getId(), msg.getSenderType(), msg.getMessageType(),
                null, msg.getMetadata(), msg.getCreatedAt()));
        return msg;
    }

    /** Same note in both party chats — the usual case for admin progress. */
    @Transactional
    public void postStatusToBoth(UUID tradeId, String code, Map<String, Object> metadata) {
        postStatus(tradeId, ParticipantRole.SELLER, code, metadata);
        postStatus(tradeId, ParticipantRole.BUYER, code, metadata);
    }
}
