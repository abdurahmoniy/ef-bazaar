package uz.efbazaar.trade.mail.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import uz.efbazaar.trade.crypto.EncryptedField;
import uz.efbazaar.trade.crypto.TradeCrypto;
import uz.efbazaar.trade.mailbox.domain.Mailbox;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Multi-context password decryptor for mailbox rows.
 *
 * <p>Provisioning history in this codebase is fragmented — different producers
 * encrypted the password with different HKDF contexts:
 *
 * <ul>
 *   <li><b>{@code mbox-{mailboxId}}</b> — {@code mailbox_rotate.py} (post-handoff
 *       rotate; the normal case a buyer will hit)</li>
 *   <li><b>{@code mbox-{tradeId}}</b> — {@code email_provision.py} (production
 *       provisioning path used before rotate has run)</li>
 *   <li><b>{@code mbox-mock-{tradeId}}</b> / {@code mbox-mock-rotate-{mailboxId}}
 *       — {@code MockWorker.java} for local dev / integration tests</li>
 *   <li><b>{@code mbox-{mailboxId}}</b> via {@link
 *       uz.efbazaar.trade.mailbox.service.MailboxService#create} — direct
 *       creation path used only in tests</li>
 * </ul>
 *
 * <p>We try contexts in the order most likely to succeed in production,
 * short-circuiting on the first successful decrypt. A row that fails every
 * attempt throws — the caller renders this as a 5xx (crypto misconfiguration),
 * not a 404 (mailbox missing).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class MailboxPasswordResolver {

    private final TradeCrypto crypto;
    private final TradeRepository trades;

    public byte[] decryptPassword(Mailbox mbox) {
        EncryptedField field = new EncryptedField(
                mbox.getPasswordIv(),
                mbox.getPasswordTag(),
                mbox.getEncryptedPassword());

        List<String> tried = new ArrayList<>(4);
        String primary = "mbox-" + mbox.getId();
        tried.add(primary);
        try {
            return crypto.decrypt(primary, field);
        } catch (RuntimeException ignored) {
            // Fall through to alternative contexts.
        }

        // Mailbox.tradeId is nulled once the trade closes (assignOwner strips
        // the FK so future scans don't reattach). Falling back to the historical
        // trade by mailboxId recovers the original provisioning context.
        UUID effectiveTradeId = mbox.getTradeId();
        if (effectiveTradeId == null) {
            Optional<Trade> handedOff = trades.findByMailboxId(mbox.getId());
            effectiveTradeId = handedOff.map(Trade::getId).orElse(null);
        }

        if (effectiveTradeId != null) {
            String tradeCtx = "mbox-" + effectiveTradeId;
            tried.add(tradeCtx);
            try {
                byte[] plain = crypto.decrypt(tradeCtx, field);
                log.warn("Mailbox {} decrypted with legacy trade-id context; row predates rotate",
                        mbox.getId());
                return plain;
            } catch (RuntimeException ignored) {
                // Try mock contexts next.
            }

            String mockTradeCtx = "mbox-mock-" + effectiveTradeId;
            tried.add(mockTradeCtx);
            try {
                byte[] plain = crypto.decrypt(mockTradeCtx, field);
                log.warn("Mailbox {} decrypted with MockWorker trade context", mbox.getId());
                return plain;
            } catch (RuntimeException ignored) {
                // Try mock-rotate next.
            }
        }

        String mockRotateCtx = "mbox-mock-rotate-" + mbox.getId();
        tried.add(mockRotateCtx);
        try {
            byte[] plain = crypto.decrypt(mockRotateCtx, field);
            log.warn("Mailbox {} decrypted with MockWorker rotate context", mbox.getId());
            return plain;
        } catch (RuntimeException lastFailure) {
            throw new IllegalStateException(
                    "Failed to decrypt mailbox " + mbox.getId() + " with any known context; tried " + tried,
                    lastFailure);
        }
    }

    /**
     * The HKDF context this row's password opens with, or empty when none of
     * the known ones does. Same candidates, same order as
     * {@link #decryptPassword}; lets a poll request carry the sealed password
     * without ever sending the plaintext.
     */
    public Optional<String> contextFor(Mailbox mbox) {
        EncryptedField field = new EncryptedField(
                mbox.getPasswordIv(), mbox.getPasswordTag(), mbox.getEncryptedPassword());
        UUID tradeId = mbox.getTradeId();
        if (tradeId == null) {
            tradeId = trades.findByMailboxId(mbox.getId()).map(Trade::getId).orElse(null);
        }
        List<String> candidates = new ArrayList<>(4);
        candidates.add("mbox-" + mbox.getId());
        if (tradeId != null) {
            candidates.add("mbox-" + tradeId);
            candidates.add("mbox-mock-" + tradeId);
        }
        candidates.add("mbox-mock-rotate-" + mbox.getId());
        for (String ctx : candidates) {
            try {
                crypto.decrypt(ctx, field);
                return Optional.of(ctx);
            } catch (RuntimeException ignored) {
                // next candidate
            }
        }
        return Optional.empty();
    }
}
