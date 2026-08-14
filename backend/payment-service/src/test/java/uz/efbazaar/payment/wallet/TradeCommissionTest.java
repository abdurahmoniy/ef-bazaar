package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.Test;
import uz.efbazaar.payment.wallet.service.TradeCommission;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** so'm × 100 = tiyin; every number below is written in tiyin. */
class TradeCommissionTest {

    private static long som(long s) {
        return s * 100;
    }

    @Test
    void tenPercentBelowTheBand() {
        assertThat(TradeCommission.feeTiyin(som(90_000))).isEqualTo(som(9_000));
    }

    @Test
    void sevenAndAHalfPercentAtAndAboveTheBand() {
        assertThat(TradeCommission.feeTiyin(som(500_000))).isEqualTo(som(37_500));
        assertThat(TradeCommission.feeTiyin(som(2_000_000))).isEqualTo(som(150_000));
    }

    @Test
    void theFloorBindsOnSmallTrades() {
        // 10% of 20 000 is 2 000, below the 5 000 floor.
        assertThat(TradeCommission.feeTiyin(som(20_000))).isEqualTo(som(5_000));
    }

    @Test
    void theHigherFloorBindsJustAboveTheBand() {
        // 7.5% of 100 000 is 7 500, below the 10 000 floor.
        assertThat(TradeCommission.feeTiyin(som(100_000))).isEqualTo(som(10_000));
        // It stops binding at 133 334, where 7.5% first exceeds 10 000.
        assertThat(TradeCommission.feeTiyin(som(200_000))).isEqualTo(som(15_000));
    }

    @Test
    void theBandBoundaryDoesNotJump() {
        long justBelow = TradeCommission.feeTiyin(som(100_000) - 1);
        long atBand = TradeCommission.feeTiyin(som(100_000));

        // A step of one tiyin in price must not move the fee by more than a
        // token amount, or sellers would price around the boundary.
        assertThat(Math.abs(atBand - justBelow)).isLessThan(som(100));
    }

    @Test
    void theFeeNeverExceedsThePrice() {
        // The 5 000 floor is larger than this whole trade.
        long price = som(3_000);
        assertThat(TradeCommission.feeTiyin(price)).isEqualTo(price);
        assertThat(TradeCommission.sellerProceedsTiyin(price)).isZero();
    }

    @Test
    void proceedsAndFeeAlwaysReconstructThePrice() {
        for (long som : new long[]{5_000, 20_000, 99_999, 100_000, 133_334, 500_000, 10_000_000}) {
            long price = som(som);
            assertThat(TradeCommission.feeTiyin(price) + TradeCommission.sellerProceedsTiyin(price))
                    .as("price %d so'm must split exactly", som)
                    .isEqualTo(price);
        }
    }

    @Test
    void theFeeRoundsInTheSellersFavour() {
        // 7.5% of 100 000,01 so'm is 750 000,075 tiyin. Truncating gives the
        // seller the fraction; rounding up would quietly give it to us.
        long price = som(100_000) + 1;
        assertThat(TradeCommission.feeTiyin(price)).isEqualTo(1_000_000L); // floor still binds
        assertThat(TradeCommission.feeTiyin(som(1_000_000) + 1)).isEqualTo(7_500_000L);
    }

    @Test
    void aNonPositivePriceIsRefused() {
        assertThatThrownBy(() -> TradeCommission.feeTiyin(0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> TradeCommission.feeTiyin(-1))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
