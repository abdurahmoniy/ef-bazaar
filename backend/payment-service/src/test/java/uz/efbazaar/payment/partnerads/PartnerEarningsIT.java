package uz.efbazaar.payment.partnerads;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;
import uz.efbazaar.payment.wallet.domain.LedgerAccount;
import uz.efbazaar.payment.wallet.domain.TransactionKind;
import uz.efbazaar.payment.wallet.service.LedgerService;
import uz.efbazaar.payment.wallet.service.LedgerService.Posting;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Hamkor daromadi ledger'dan o'qiladi.
 *
 * <p>NEGA HAQIQIY BAZA: bu JPQL agregat, ishorani teskarisiga
 * o'giradi va hisob turi bo'yicha filtrlaydi. Mock ustida bunday
 * so'rov umuman ishlamaydi — u faqat haqiqiy drayverda tekshiriladi.
 */
@SpringBootTest
class PartnerEarningsIT extends AbstractPostgresIT {

    @Autowired LedgerService ledger;
    @Autowired PartnerAdLedgerService ads;

    private final UUID partner = UUID.randomUUID();
    private final UUID seller = UUID.randomUUID();

    private void credit(TransactionKind kind, String key, long tiyin) {
        ledger.post(kind, key, null, "test",
                List.of(new Posting(LedgerAccount.PLATFORM_REVENUE, null, tiyin),
                        new Posting(LedgerAccount.USER_AVAILABLE, partner, -tiyin)));
    }

    @Test
    @DisplayName("each stream is counted on its own")
    void streamsAreSeparate() {
        credit(TransactionKind.PARTNER_TRADE_SHARE, "share:" + UUID.randomUUID(), 10_000L);
        credit(TransactionKind.PARTNER_TRADE_SHARE, "share:" + UUID.randomUUID(), 5_000L);
        credit(TransactionKind.PARTNER_MONTHLY, "monthly:" + UUID.randomUUID(), 30_000_000L);

        var earnings = ads.earningsOf(partner);

        assertThat(earnings.fromTradesTiyin()).isEqualTo(15_000L);
        assertThat(earnings.monthlyTiyin()).isEqualTo(30_000_000L);
        assertThat(earnings.fromPostsTiyin()).isZero();
    }

    @Test
    @DisplayName("earnings come back positive, not as the ledger's negative credit")
    void earningsArePositive() {
        // Ledger'da foydalanuvchiga tushgan pul MANFIY yoziladi. Panelda
        // "daromadingiz: -300 000" ko'rgan hamkor qarzdorman deb
        // o'ylaydi.
        credit(TransactionKind.PARTNER_MONTHLY, "monthly:" + UUID.randomUUID(), 300_000L);

        assertThat(ads.earningsOf(partner).monthlyTiyin()).isPositive();
    }

    @Test
    @DisplayName("another partner's money is not counted")
    void otherPartnersAreNotCounted() {
        credit(TransactionKind.PARTNER_TRADE_SHARE, "share:" + UUID.randomUUID(), 10_000L);

        assertThat(ads.earningsOf(UUID.randomUUID()).fromTradesTiyin()).isZero();
    }

    @Test
    @DisplayName("a partner who has been paid nothing reads zero, not an error")
    void nothingPaidReadsZero() {
        var earnings = ads.earningsOf(UUID.randomUUID());

        assertThat(earnings.fromPostsTiyin()).isZero();
        assertThat(earnings.fromTradesTiyin()).isZero();
        assertThat(earnings.monthlyTiyin()).isZero();
    }

    @Test
    @DisplayName("money that is only held is not earnings")
    void heldMoneyIsNotEarnings() {
        // USER_HELD — ushlangan pul: u hali hech kimniki emas va
        // qaytarilishi mumkin. Hisob bo'yicha filtrlamasak, sotuvchi
        // to'lagan-u post hali chiqmagan summa hamkorning daromadi
        // bo'lib ko'rinardi.
        ledger.post(TransactionKind.PARTNER_POST_SETTLE, "held:" + UUID.randomUUID(), null, "test",
                List.of(new Posting(LedgerAccount.PLATFORM_REVENUE, null, 50_000L),
                        new Posting(LedgerAccount.USER_HELD, partner, -50_000L)));

        assertThat(ads.earningsOf(partner).fromPostsTiyin()).isZero();
    }

    @Test
    @DisplayName("only the credited side of a transaction earns")
    void onlyTheCreditedSideEarns() {
        // Bitta tranzaksiya ikki foydalanuvchiga tegadi. Sotuvchining
        // tomoni debet — uning "daromadi" manfiy bo'lib chiqardi.
        ledger.post(TransactionKind.PARTNER_POST_SETTLE, "settle:" + UUID.randomUUID(), null, "test",
                List.of(new Posting(LedgerAccount.PLATFORM_REVENUE, null, 20_000L),
                        new Posting(LedgerAccount.USER_AVAILABLE, partner, -20_000L)));

        assertThat(ads.earningsOf(partner).fromPostsTiyin()).isEqualTo(20_000L);
        assertThat(ads.earningsOf(seller).fromPostsTiyin()).isZero();
    }
}
