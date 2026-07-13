package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeMessageRepository;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Arrays;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

/**
 * Konami password passthrough — seller → buyer via a single Redis-held key.
 *
 * <p>Unlike other encrypted messages (which are decryptable with the master
 * key + HKDF context), a PASSWORD_ONETIME message is encrypted with a random
 * 32-byte key that lives only in Redis with a 30-minute TTL. On the FIRST
 * successful reveal the key is deleted. After that the ciphertext is
 * mathematically unrecoverable — not by admins, not by us with the master
 * key, not by anyone. Spec §6 §12 mandate this exactly.
 */
@Service
@RequiredArgsConstructor
public class OneTimePasswordService {

    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_IV_BYTES = 12;
    private static final long REDIS_TTL_SECONDS = 1800;

    private final StringRedisTemplate redis;
    private final TradeService trades;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeAuditService audit;
    private final SecureRandom rng = new SecureRandom();

    /**
     * Persists a PASSWORD_ONETIME message in BOTH seller and buyer chats
     * (buyer chat holds the retrievable body; seller chat holds a status
     * marker). Transitions the trade to WAITING_BUYER_VERIFY.
     *
     * @return the messageId (matches in both chats' rows via metadata.groupId)
     */
    @Transactional
    public UUID sendPassword(UUID tradeId, String password, UUID senderUserId) {
        Trade t = trades.get(tradeId, senderUserId);
        if (t.roleFor(senderUserId) != ParticipantRole.SELLER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only seller may send password");
        }

        byte[] key = new byte[32];
        rng.nextBytes(key);
        byte[] iv = new byte[GCM_IV_BYTES];
        rng.nextBytes(iv);

        byte[] cipherAndTag;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, iv));
            cipherAndTag = cipher.doFinal(password.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("Failed to encrypt one-time password", e);
        }
        byte[] ciphertext = Arrays.copyOfRange(cipherAndTag, 0, cipherAndTag.length - 16);
        byte[] tag        = Arrays.copyOfRange(cipherAndTag, cipherAndTag.length - 16, cipherAndTag.length);

        UUID messageId = UUID.randomUUID();

        // Store the key in Redis. Deleting it on reveal makes the ciphertext permanently opaque.
        redis.opsForValue().set(redisKey(tradeId, messageId),
                Base64.getEncoder().encodeToString(key),
                Duration.ofSeconds(REDIS_TTL_SECONDS));

        var buyerChat = chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.BUYER)
                .orElseThrow(() -> new EntityNotFoundException("buyer chat"));

        // Buyer's copy carries the recoverable ciphertext.
        TradeMessage buyerMsg = TradeMessage.builder()
                .id(messageId)
                .tradeChatId(buyerChat.getId())
                .senderType(TradeSenderType.USER)
                .messageType(TradeMessageType.PASSWORD_ONETIME)
                .encryptedBody(ciphertext)
                .iv(iv)
                .tag(tag)
                .metadata(Map.of("groupId", messageId.toString()))
                .build();
        messages.save(buyerMsg);

        // Seller's copy is a status marker (no body). Same id space (different chat).
        var sellerChat = chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.SELLER)
                .orElseThrow(() -> new EntityNotFoundException("seller chat"));
        TradeMessage sellerMarker = TradeMessage.builder()
                .id(UUID.randomUUID())
                .tradeChatId(sellerChat.getId())
                .senderType(TradeSenderType.SMART_ADMIN)
                .messageType(TradeMessageType.STATUS)
                .metadata(Map.of("code", "PASSWORD_SENT", "groupId", messageId.toString()))
                .build();
        messages.save(sellerMarker);

        trades.transition(tradeId, TradeEvent.PASSWORD_SENT, ActorType.USER, senderUserId);
        return messageId;
    }

    /**
     * Fetches key from Redis, decrypts, deletes the key. Second call throws.
     */
    @Transactional
    public String reveal(UUID tradeId, UUID messageId, UUID viewerUserId) {
        Trade t = trades.get(tradeId, viewerUserId);
        if (t.roleFor(viewerUserId) != ParticipantRole.BUYER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only buyer may reveal");
        }

        var buyerChat = chats.findByTradeIdAndParticipant(tradeId, ParticipantRole.BUYER)
                .orElseThrow(() -> new EntityNotFoundException("buyer chat"));
        var msg = messages.findById(messageId)
                .filter(m -> m.getTradeChatId().equals(buyerChat.getId()))
                .filter(m -> m.getMessageType() == TradeMessageType.PASSWORD_ONETIME)
                .orElseThrow(() -> new EntityNotFoundException("password message"));

        String encoded = redis.opsForValue().get(redisKey(tradeId, messageId));
        if (encoded == null) {
            throw new IllegalStateException("Password already revealed or expired");
        }
        byte[] key = Base64.getDecoder().decode(encoded);

        byte[] cipherAndTag = new byte[msg.getEncryptedBody().length + msg.getTag().length];
        System.arraycopy(msg.getEncryptedBody(), 0, cipherAndTag, 0, msg.getEncryptedBody().length);
        System.arraycopy(msg.getTag(), 0, cipherAndTag, msg.getEncryptedBody().length, msg.getTag().length);

        String plaintext;
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec(key, "AES"),
                    new GCMParameterSpec(GCM_TAG_BITS, msg.getIv()));
            plaintext = new String(cipher.doFinal(cipherAndTag), StandardCharsets.UTF_8);
        } catch (Exception e) {
            throw new IllegalStateException("Failed to decrypt one-time password", e);
        }

        // Point of no return.
        redis.delete(redisKey(tradeId, messageId));
        audit.record(tradeId, ActorType.USER, viewerUserId, "PASSWORD_REVEALED",
                Map.of("messageId", messageId.toString()));
        return plaintext;
    }

    private static String redisKey(UUID tradeId, UUID messageId) {
        return "trade:" + tradeId + ":password-key:" + messageId;
    }
}
