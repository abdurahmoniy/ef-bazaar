package uz.efbazaar.trade.trade.service;

import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.kafka.TradeEvents;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.exception.PasswordAlreadyRevealedException;
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
 * 32-byte key that lives only in Redis. On the FIRST successful reveal the key
 * is deleted. After that the ciphertext is mathematically unrecoverable — not
 * by admins, not by us with the master key, not by anyone. Spec §6 §12 mandate
 * this exactly.
 *
 * <p>The key expires with the window the recipient is actually given, not on a
 * fixed 30 minutes of its own. It was the latter while WAITING_BUYER_VERIFY
 * runs for 24 hours, and the panel counts those hours down on screen: a party
 * who waited longer than half an hour was told the password had already been
 * revealed or expired, could not be sent another — PASSWORD_SENT exists only
 * out of WAITING_PASSWORD — and had already handed their own account over. The
 * one-time property is untouched by this; only an unopened key lives longer.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OneTimePasswordService {

    private static final int GCM_TAG_BITS = 128;
    private static final int GCM_IV_BYTES = 12;
    /**
     * How long an unopened key survives. Read from the same setting that sets
     * the deadline the panel shows, plus a margin, so the two cannot drift
     * apart — that gap is what cost a party their account.
     */
    @Value("${trade.timeouts.waiting-buyer-verify-seconds}")
    private long revealWindowSeconds;

    /** Covers the clock between the password being sent and the state's own deadline. */
    private static final long REVEAL_TTL_MARGIN_SECONDS = 3600;

    private final StringRedisTemplate redis;
    private final TradeService trades;
    private final TradeChatRepository chats;
    private final TradeMessageRepository messages;
    private final TradeAuditService audit;
    private final TradeEventPublisher events;
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
        ParticipantRole senderRole = t.roleFor(senderUserId);
        // On a sale only the seller hands an account over. On a swap both do,
        // so either party may send — each sending the password to the account
        // THEY are giving up.
        if (!t.getKind().isSwap() && senderRole != ParticipantRole.SELLER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only seller may send password");
        }
        // The password is for the other party to use, so it lands in their chat.
        ParticipantRole recipientRole = senderRole == ParticipantRole.SELLER
                ? ParticipantRole.BUYER : ParticipantRole.SELLER;

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

        var recipientChat = chats.findByTradeIdAndParticipant(tradeId, recipientRole)
                .orElseThrow(() -> new EntityNotFoundException(recipientRole + " chat"));

        // The recipient's copy carries the recoverable ciphertext.
        TradeMessage buyerMsg = TradeMessage.builder()
                .id(messageId)
                .tradeChatId(recipientChat.getId())
                .senderType(TradeSenderType.USER)
                .messageType(TradeMessageType.PASSWORD_ONETIME)
                .encryptedBody(ciphertext)
                .iv(iv)
                .tag(tag)
                .metadata(Map.of("groupId", messageId.toString()))
                .build();
        messages.save(buyerMsg);

        // The sender's own copy is a status marker (no body): they typed it, so
        // they do not need it back, but their panel needs to show it went.
        var senderChat = chats.findByTradeIdAndParticipant(tradeId, senderRole)
                .orElseThrow(() -> new EntityNotFoundException(senderRole + " chat"));
        TradeMessage sellerMarker = TradeMessage.builder()
                .id(UUID.randomUUID())
                .tradeChatId(senderChat.getId())
                .senderType(TradeSenderType.SMART_ADMIN)
                .messageType(TradeMessageType.STATUS)
                .metadata(Map.of("code", "PASSWORD_SENT", "groupId", messageId.toString()))
                .build();
        messages.save(sellerMarker);

        // State-machine guard runs BEFORE the Redis key is written — if the
        // trade isn't in WAITING_PASSWORD this throws and the transaction
        // rolls back, so we never orphan a key with no reachable message row.
        trades.transition(tradeId, TradeEvent.PASSWORD_SENT, ActorType.USER, senderUserId);

        UUID recipientUserId = recipientRole == ParticipantRole.BUYER ? t.getBuyerId() : t.getSellerId();
        events.tradeAction(tradeId, t.getChatId(), recipientUserId,
                TradeEvents.TradeActionType.PASSWORD_SENT, t.getPriceUzs(), null, t.getKind());

        // Defer the Redis put to afterCommit (same pattern as
        // TradeEventPublisher.send): if the transaction rolls back for any
        // reason after this point, the key is never written.
        String redisKey = redisKey(tradeId, messageId);
        String encodedKey = Base64.getEncoder().encodeToString(key);
        putRedisKeyAfterCommit(redisKey, encodedKey);

        return messageId;
    }

    private void putRedisKeyAfterCommit(String redisKey, String encodedKey) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    redis.opsForValue().set(redisKey, encodedKey, Duration.ofSeconds(revealTtlSeconds()));
                }
            });
        } else {
            redis.opsForValue().set(redisKey, encodedKey, Duration.ofSeconds(revealTtlSeconds()));
        }
    }

    /**
     * Atomically fetches-and-deletes the key from Redis (GETDEL), then decrypts.
     * Second call throws — the GETDEL is atomic so concurrent revealers cannot
     * both observe the key.
     */
    @Transactional
    public String reveal(UUID tradeId, UUID messageId, UUID viewerUserId) {
        Trade t = trades.get(tradeId, viewerUserId);
        ParticipantRole viewerRole = t.roleFor(viewerUserId);
        if (!t.getKind().isSwap() && viewerRole != ParticipantRole.BUYER) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Only buyer may reveal");
        }

        // Whichever chat is the viewer's own. The message only exists in the
        // recipient's chat, so this filter is also the authorisation: a party
        // cannot reveal the password to the account they themselves gave up.
        var buyerChat = chats.findByTradeIdAndParticipant(tradeId, viewerRole)
                .orElseThrow(() -> new EntityNotFoundException(viewerRole + " chat"));
        var msg = messages.findById(messageId)
                .filter(m -> m.getTradeChatId().equals(buyerChat.getId()))
                .filter(m -> m.getMessageType() == TradeMessageType.PASSWORD_ONETIME)
                .orElseThrow(() -> new EntityNotFoundException("password message"));

        // Atomic fetch-and-delete (Redis GETDEL, since 6.2) — a second concurrent
        // caller is guaranteed to observe null, closing the reveal-twice race.
        String encoded = redis.opsForValue().getAndDelete(redisKey(tradeId, messageId));
        if (encoded == null) {
            throw new PasswordAlreadyRevealedException("Password already revealed or expired");
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

        // The Redis GETDEL above is atomic and already irreversible by this
        // point — the key is gone regardless of what happens next. If the
        // audit write fails, we must NOT let that surface as an error to the
        // buyer (they already have the plaintext and cannot re-request it);
        // instead we log at ERROR so ops has a trace even without a DB row.
        try {
            audit.record(tradeId, ActorType.USER, viewerUserId, "PASSWORD_REVEALED",
                    Map.of("messageId", messageId.toString()));
        } catch (RuntimeException e) {
            log.error("Failed to audit PASSWORD_REVEALED after successful GETDEL — " +
                            "tradeId={} messageId={} viewerUserId={}",
                    tradeId, messageId, viewerUserId, e);
        }
        return plaintext;
    }

    long revealTtlSeconds() {
        return revealWindowSeconds + REVEAL_TTL_MARGIN_SECONDS;
    }

    private static String redisKey(UUID tradeId, UUID messageId) {
        return "trade:" + tradeId + ":password-key:" + messageId;
    }
}
