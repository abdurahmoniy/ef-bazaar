package uz.efbazaar.payment.wallet.dto;

import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;

import java.time.Instant;
import java.util.UUID;

/**
 * One ledger entry belonging to the caller. The sign is the ledger's own:
 * negative is a credit to the user, positive a debit. The UI flips it for
 * display rather than the backend lying about the sign.
 */
public record WalletEntryResponse(
        UUID transactionId,
        TransactionKind kind,
        LedgerAccount account,
        long amountTiyin,
        Instant createdAt,
        UUID tradeId
) {
    public WalletEntryResponse(UUID transactionId, TransactionKind kind, LedgerAccount account,
                               long amountTiyin, Instant createdAt) {
        this(transactionId, kind, account, amountTiyin, createdAt, (UUID) null);
    }

    /** JPQL projection: retain the key only long enough to identify the trade. */
    public WalletEntryResponse(UUID transactionId, TransactionKind kind, LedgerAccount account,
                               long amountTiyin, Instant createdAt, String idempotencyKey) {
        this(transactionId, kind, account, amountTiyin, createdAt, tradeIdFrom(kind, idempotencyKey));
    }

    private static UUID tradeIdFrom(TransactionKind kind, String key) {
        if (kind == null || key == null) return null;
        String prefix = switch (kind) {
            case TRADE_HOLD -> "trade-hold-";
            case TRADE_SETTLE -> "trade-settle-";
            case TRADE_RELEASE -> "trade-release-";
            default -> null;
        };
        if (prefix == null || !key.startsWith(prefix)) return null;
        String value = key.substring(prefix.length());
        if (value.length() != 36) return null;
        try {
            UUID tradeId = UUID.fromString(value);
            // UUID.fromString also accepts abbreviated groups; ledger keys never do.
            return tradeId.toString().equals(value) ? tradeId : null;
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }
}
