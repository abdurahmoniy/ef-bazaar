package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.dto.TradeMessageResponse;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TradeChatService {

    private final TradeService trades;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeCrypto crypto;

    @Transactional
    public TradeMessage postText(UUID tradeId, UUID viewerUserId, String text) {
        Trade t = trades.get(tradeId, viewerUserId);
        if (t.getState().isTerminal()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Trade is closed — no new messages allowed");
        }
        ParticipantRole role = t.roleFor(viewerUserId);
        var chat = chats.findByTradeIdAndParticipant(tradeId, role)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + role));

        UUID messageId = UUID.randomUUID();
        EncryptedField enc = crypto.encrypt(
                context(tradeId, messageId),
                text.getBytes(StandardCharsets.UTF_8));

        TradeMessage msg = TradeMessage.builder()
                .id(messageId)
                .tradeChatId(chat.getId())
                .senderType(TradeSenderType.USER)
                .messageType(TradeMessageType.TEXT)
                .encryptedBody(enc.ciphertext())
                .iv(enc.iv())
                .tag(enc.tag())
                .build();
        return messages.save(msg);
    }

    @Transactional(readOnly = true)
    public List<TradeMessageResponse> list(UUID tradeId, UUID viewerUserId) {
        Trade t = trades.get(tradeId, viewerUserId);
        ParticipantRole role = t.roleFor(viewerUserId);
        var chat = chats.findByTradeIdAndParticipant(tradeId, role)
                .orElseThrow(() -> new EntityNotFoundException("chat for " + role));

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
}
