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
        Instant createdAt
) {}
