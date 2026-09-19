package uz.efbazaar.payment.wallet;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.dto.WalletEntryResponse;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class WalletEntryResponseTest {

    private static final UUID TRADE_ID = UUID.fromString("12345678-1234-4234-8234-123456789abc");
    private static final UUID TRANSACTION_ID = UUID.fromString("87654321-1234-4234-8234-123456789abc");
    private static final Instant CREATED_AT = Instant.parse("2026-09-19T00:00:00Z");

    @ParameterizedTest
    @CsvSource({"TRADE_HOLD, trade-hold-", "TRADE_SETTLE, trade-settle-", "TRADE_RELEASE, trade-release-"})
    void exposesTheAssociatedTradeWithoutChangingLedgerFields(TransactionKind kind, String prefix) {
        var entry = entry(kind, prefix + TRADE_ID);

        assertThat(entry.tradeId()).isEqualTo(TRADE_ID);
        assertThat(entry.transactionId()).isEqualTo(TRANSACTION_ID);
        assertThat(entry.kind()).isEqualTo(kind);
        assertThat(entry.account()).isEqualTo(LedgerAccount.USER_AVAILABLE);
        assertThat(entry.amountTiyin()).isEqualTo(-50_000);
        assertThat(entry.createdAt()).isEqualTo(CREATED_AT);
    }

    @Test
    void onlyTheMatchingTransactionKindCanResolveEachCanonicalKey() {
        for (var kind : TransactionKind.values()) {
            assertThat(entry(kind, "trade-hold-" + TRADE_ID).tradeId())
                    .isEqualTo(kind == TransactionKind.TRADE_HOLD ? TRADE_ID : null);
            assertThat(entry(kind, "trade-settle-" + TRADE_ID).tradeId())
                    .isEqualTo(kind == TransactionKind.TRADE_SETTLE ? TRADE_ID : null);
            assertThat(entry(kind, "trade-release-" + TRADE_ID).tradeId())
                    .isEqualTo(kind == TransactionKind.TRADE_RELEASE ? TRADE_ID : null);
        }
        assertThat(entry(null, "trade-hold-" + TRADE_ID).tradeId()).isNull();
    }

    @ParameterizedTest
    @NullAndEmptySource
    @ValueSource(strings = {
            "trade-hold-", "trade-hold-not-a-uuid", "trade-hold-1-1-1-1-1",
            "trade-hold-12345678-1234-4234-8234-123456789abc-extra",
            "trade-hold-12345678-1234-4234-8234-123456789abc ",
            " trade-hold-12345678-1234-4234-8234-123456789abc",
            "trade-hold-12345678-1234-4234-8234-123456789ABC",
            "trade-hold-12345678-1234-4234-8234-123456789abz",
            "trade-partner-share-12345678-1234-4234-8234-123456789abc",
            "trade 12345678-1234-4234-8234-123456789abc fee 50000"
    })
    void malformedOrUnrelatedKeysHaveNoTradeAssociation(String key) {
        assertThat(entry(TransactionKind.TRADE_HOLD, key).tradeId()).isNull();
    }

    @Test
    void keepsTheExistingFiveArgumentConstructor() {
        var entry = new WalletEntryResponse(TRANSACTION_ID, TransactionKind.TRADE_HOLD,
                LedgerAccount.USER_AVAILABLE, -50_000, CREATED_AT);
        assertThat(entry.tradeId()).isNull();
        assertThat(entry.transactionId()).isEqualTo(TRANSACTION_ID);
    }

    @Test
    void serializesOnlyTheTradeIdAndNeverTheInternalKey() throws Exception {
        var mapper = new ObjectMapper().findAndRegisterModules();
        var json = mapper.readTree(mapper.writeValueAsString(entry(TransactionKind.TRADE_HOLD, "trade-hold-" + TRADE_ID)));
        assertThat(json.path("tradeId").asText()).isEqualTo(TRADE_ID.toString());
        assertThat(json.has("idempotencyKey")).isFalse();
        assertThat(json.has("note")).isFalse();
        assertThat(json.toString()).doesNotContain("trade-hold-");
    }

    private static WalletEntryResponse entry(TransactionKind kind, String key) {
        return new WalletEntryResponse(TRANSACTION_ID, kind, LedgerAccount.USER_AVAILABLE,
                -50_000, CREATED_AT, key);
    }
}
