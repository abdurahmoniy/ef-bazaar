package uz.efbazaar.payment.wallet.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.LedgerEntry;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.domain.WalletAccount;
import uz.efbazaar.payment.wallet.dto.WalletEntryResponse;
import uz.efbazaar.payment.wallet.repository.LedgerEntryRepository;
import uz.efbazaar.payment.wallet.repository.WalletAccountRepository;
import uz.efbazaar.payment.wallet.repository.WalletTransactionRepository;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * The only writer of {@code ledger_entries} and the only mutator of
 * {@code wallet_accounts}. Every money movement in the platform goes through
 * {@link #post}.
 *
 * <p>Sign convention: positive debits, negative credits. User accounts are
 * liabilities, so a credit (negative) increases what the user owns.
 *
 * <p>Two invariants are enforced here rather than hoped for: the postings of
 * one transaction sum to zero, and the wallet projection moves in the same
 * transaction as the entries. A negative balance is caught by
 * {@code chk_wallet_non_negative} in the database, so a bug aborts the
 * transaction instead of corrupting a balance.
 */
@Service
@RequiredArgsConstructor
public class LedgerService {

    private final WalletAccountRepository wallets;
    private final WalletTransactionRepository transactions;
    private final LedgerEntryRepository entries;

    public record Posting(LedgerAccount account, UUID userId, long amountTiyin) {}

    @Transactional
    public UUID post(TransactionKind kind, String idempotencyKey, UUID createdBy,
                     String note, List<Posting> postings) {

        // Fast path: a repeat of an already-committed key writes nothing and
        // returns the original. This is an optimisation, not the correctness
        // guarantee -- see insertIfAbsent below for that.
        var existing = transactions.findByIdempotencyKey(idempotencyKey);
        if (existing.isPresent()) {
            return existing.get().getId();
        }

        if (postings == null || postings.isEmpty()) {
            throw new IllegalArgumentException("A transaction needs at least one posting");
        }
        long total = postings.stream().mapToLong(Posting::amountTiyin).sum();
        if (total != 0) {
            throw new IllegalArgumentException(
                    "Postings must sum to zero, got " + total + " for key " + idempotencyKey);
        }
        for (Posting p : postings) {
            // chk_entry_non_zero would catch this too, but a constraint
            // violation dooms the whole transaction in PostgreSQL, so the caller
            // gets a 409 about nothing instead of the clean 400 its sibling
            // invariants raise.
            if (p.amountTiyin() == 0) {
                throw new IllegalArgumentException(
                        "A posting to " + p.account() + " must move a non-zero amount");
            }
            if (p.account().isUserScoped() && p.userId() == null) {
                throw new IllegalArgumentException(p.account() + " requires a userId");
            }
            if (!p.account().isUserScoped() && p.userId() != null) {
                throw new IllegalArgumentException(p.account() + " must not carry a userId");
            }
        }

        UUID txId = UUID.randomUUID();
        // ON CONFLICT DO NOTHING instead of save(): two callers racing on the
        // same key (a Kafka redelivery during a consumer rebalance, say) must
        // not have the loser throw a UNIQUE-violation that would mark this
        // whole transaction rollback-only. If we lost the race, somebody
        // else's row already exists -- return its id and write nothing else.
        int inserted = transactions.insertIfAbsent(
                txId, kind.name(), idempotencyKey, Instant.now(), createdBy, note);
        if (inserted == 0) {
            return transactions.findByIdempotencyKey(idempotencyKey)
                    .orElseThrow(() -> new IllegalStateException(
                            "wallet_transactions row missing immediately after an insertIfAbsent conflict for key "
                                    + idempotencyKey))
                    .getId();
        }

        for (Posting p : postings) {
            entries.save(LedgerEntry.builder()
                    .transactionId(txId)
                    .account(p.account())
                    .userId(p.userId())
                    .amountTiyin(p.amountTiyin())
                    .build());
            applyToProjection(kind, p);
        }
        // Force the wallet CHECK constraints to fire inside this transaction
        // rather than at an arbitrary later flush.
        wallets.flush();
        return txId;
    }

    @Transactional
    public WalletAccount balanceOf(UUID userId) {
        return wallets.findById(userId).orElseGet(() -> {
            // ON CONFLICT DO NOTHING: a concurrent first touch of this same
            // brand-new userId (a deposit landing while this read races it)
            // may have already created the row. Either way, read it back
            // rather than assuming this call's insert won.
            wallets.insertIfAbsent(userId);
            return wallets.findById(userId).orElseThrow(() -> new IllegalStateException(
                    "wallet_accounts row missing immediately after insertIfAbsent for user " + userId));
        });
    }

    @Transactional(readOnly = true)
    public List<WalletEntryResponse> historyOf(UUID userId, int limit) {
        return entries.findHistory(userId, PageRequest.of(0, limit));
    }

    private void applyToProjection(TransactionKind kind, Posting p) {
        if (!p.account().isUserScoped()) {
            return;
        }
        // Ensure the row exists BEFORE taking the lock: there is nothing to
        // lock for a brand-new userId, so two concurrent first touches (e.g.
        // a deposit crediting while the wallet page loads) would otherwise
        // both try to INSERT the same primary key. ON CONFLICT DO NOTHING
        // lets the loser fall through to the locked read below instead of
        // throwing; the row it then locks is whichever call's insert won.
        wallets.insertIfAbsent(p.userId());
        WalletAccount w = wallets.findByIdForUpdate(p.userId())
                .orElseThrow(() -> new IllegalStateException(
                        "wallet_accounts row missing immediately after insertIfAbsent for user " + p.userId()));

        // A credit is negative and increases the user's holding.
        long delta = -p.amountTiyin();
        switch (p.account()) {
            case USER_AVAILABLE -> {
                w.setAvailableTiyin(w.getAvailableTiyin() + delta);
                // Only a real deposit counts. A trade release also credits
                // USER_AVAILABLE, and counting it would inflate the lifetime
                // total every time a trade failed.
                if (kind == TransactionKind.DEPOSIT && delta > 0) {
                    w.setLifetimeDepositedTiyin(w.getLifetimeDepositedTiyin() + delta);
                }
            }
            case USER_HELD -> w.setHeldTiyin(w.getHeldTiyin() + delta);
            case WITHDRAW_PENDING ->
                    w.setWithdrawPendingTiyin(w.getWithdrawPendingTiyin() + delta);
            default -> throw new IllegalStateException("Not user-scoped: " + p.account());
        }
        w.setUpdatedAt(Instant.now());
        wallets.save(w);
    }
}
