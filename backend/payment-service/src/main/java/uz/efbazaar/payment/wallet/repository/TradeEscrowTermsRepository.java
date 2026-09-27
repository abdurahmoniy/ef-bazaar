package uz.efbazaar.payment.wallet.repository;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.Optional;
import java.util.UUID;

/** Immutable amounts agreed when funds were held; rates may change afterwards. */
@Repository
@RequiredArgsConstructor
public class TradeEscrowTermsRepository {
    private final JdbcTemplate jdbc;
    public record Terms(long fee, long buyerHold, long sellerHold, long sellerProceeds, String resolution) {}

    public Optional<Terms> findForUpdate(UUID id) {
        return jdbc.query("SELECT * FROM trade_escrow_terms WHERE trade_id = ? FOR UPDATE",
                (rs, row) -> new Terms(rs.getLong("fee_tiyin"), rs.getLong("buyer_hold_tiyin"),
                        rs.getLong("seller_hold_tiyin"), rs.getLong("seller_proceeds_tiyin"), rs.getString("resolution")), id)
                .stream().findFirst();
    }

    public void insert(UUID id, Terms t) {
        jdbc.update("""
                INSERT INTO trade_escrow_terms
                    (trade_id, fee_tiyin, buyer_hold_tiyin, seller_hold_tiyin, seller_proceeds_tiyin)
                VALUES (?, ?, ?, ?, ?) ON CONFLICT (trade_id) DO NOTHING
                """, id, t.fee(), t.buyerHold(), t.sellerHold(), t.sellerProceeds());
    }

    /** Recover pre-migration holds from the immutable ledger, never today's fee settings. */
    public Terms restoreLegacy(UUID id, UUID buyer, UUID seller, long price) {
        var hold = jdbc.queryForMap("SELECT id, note FROM wallet_transactions WHERE idempotency_key = ? FOR UPDATE",
                "trade-hold-" + id);
        var existing = findForUpdate(id);
        if (existing.isPresent()) return existing.get();
        String note = (String) hold.get("note");
        var match = java.util.regex.Pattern.compile(" fee ([0-9]+)$").matcher(note == null ? "" : note);
        if (!match.find()) throw new IllegalStateException("Original escrow fee missing for trade " + id);
        long fee = Long.parseLong(match.group(1));
        long buyerHold = heldBy(hold.get("id"), buyer);
        long sellerHold = heldBy(hold.get("id"), seller);
        var prior = jdbc.queryForList("SELECT idempotency_key FROM wallet_transactions WHERE idempotency_key IN (?, ?)",
                String.class, "trade-settle-" + id, "trade-release-" + id);
        String resolution = prior.isEmpty() ? null : prior.getFirst().startsWith("trade-settle-") ? "settle" : "release";
        insert(id, new Terms(fee, buyerHold, sellerHold, price - fee, null));
        if (resolution != null) resolve(id, resolution);
        return findForUpdate(id).orElseThrow();
    }

    private long heldBy(Object transactionId, UUID user) {
        if (user == null) return 0;
        return jdbc.queryForObject("""
                SELECT COALESCE(-SUM(amount_tiyin), 0) FROM ledger_entries
                WHERE transaction_id = ? AND account = 'USER_HELD' AND user_id = ?
                """, Long.class, transactionId, user);
    }

    public void resolve(UUID id, String resolution) {
        jdbc.update("UPDATE trade_escrow_terms SET resolution = ? WHERE trade_id = ?", resolution, id);
    }
}
