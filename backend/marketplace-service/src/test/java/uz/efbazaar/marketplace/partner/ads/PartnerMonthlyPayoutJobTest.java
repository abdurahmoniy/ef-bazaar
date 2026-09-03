package uz.efbazaar.marketplace.partner.ads;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.partner.PartnerSettings;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Oyning birinchi sanasidagi fiks to'lov.
 *
 * <p>Bu yerdagi xato jimgina pul yo'qotadi yoki jimgina to'lamaydi —
 * ikkalasini ham faqat oy oxirida hisob-kitob qilganda sezish mumkin.
 */
class PartnerMonthlyPayoutJobTest {

    private PartnerChannelRepository channels;
    private PartnerAdClient payments;
    private PartnerMonthlyPayoutJob job;

    private PartnerChannel fixedChannel;
    private PartnerChannel secondFixedChannel;
    private PartnerChannel percentChannel;

    @BeforeEach
    void setUp() {
        channels = mock(PartnerChannelRepository.class);
        payments = mock(PartnerAdClient.class);
        PartnerSettingsRepository settingsRepository = mock(PartnerSettingsRepository.class);

        PartnerSettings settings = new PartnerSettings();
        settings.setDefaultPayoutMode("PERCENT");
        settings.setDefaultTradePercentBp(1000);
        settings.setDefaultFixedMonthlySom(BigDecimal.ZERO);
        when(settingsRepository.findById(PartnerSettings.SINGLETON_ID)).thenReturn(Optional.of(settings));

        fixedChannel = fixed("Birinchi", new BigDecimal("300000.00"));
        secondFixedChannel = fixed("Ikkinchi", new BigDecimal("120000.00"));
        percentChannel = channel("Foizli");

        when(channels.findByActiveTrueOrderBySubscriberCountDesc())
                .thenReturn(List.of(fixedChannel, secondFixedChannel, percentChannel));

        job = new PartnerMonthlyPayoutJob(channels, payments,
                new PartnerPayoutPolicy(settingsRepository));
    }

    private PartnerChannel channel(String title) {
        PartnerChannel c = new PartnerChannel();
        c.setId(UUID.randomUUID());
        c.setPartnerUserId(UUID.randomUUID());
        c.setTitle(title);
        c.setActive(true);
        // Oldingi oydan ancha oldin ochilgan — to'liq oy to'lanadi.
        c.setCreatedAt(LocalDate.of(2026, 1, 1).atStartOfDay(ZoneOffset.UTC).toInstant());
        return c;
    }

    private PartnerChannel fixed(String title, BigDecimal monthly) {
        PartnerChannel c = channel(title);
        c.setPayoutMode("FIXED");
        c.setFixedMonthlySom(monthly);
        return c;
    }

    @Test
    @DisplayName("every active fixed-mode channel is paid on the first")
    void paysFixedChannels() {
        job.run(YearMonth.of(2026, 10));

        verify(payments).monthly(eq(fixedChannel.getId()), eq(fixedChannel.getPartnerUserId()),
                eq(new BigDecimal("300000.00")), eq("2026-09"));
    }

    @Test
    @DisplayName("percent-mode channels are not paid monthly")
    void skipsPercentChannels() {
        job.run(YearMonth.of(2026, 10));

        verify(payments, never()).monthly(eq(percentChannel.getId()), any(), any(), any());
    }

    @Test
    @DisplayName("the first month is pro-rated by days")
    void proRatesTheFirstMonth() {
        // 20-sanada ochilgan kanalga to'liq oy to'lansa, tasdiq sanasini
        // tanlash o'ynaladigan narsaga aylanardi. Sentyabr 30 kun,
        // 20-sanadan oxirigacha 11 kun.
        fixedChannel.setCreatedAt(LocalDate.of(2026, 9, 20).atStartOfDay(ZoneOffset.UTC).toInstant());

        job.run(YearMonth.of(2026, 10));

        verify(payments).monthly(eq(fixedChannel.getId()), any(),
                eq(new BigDecimal("110000.00")), eq("2026-09"));
    }

    @Test
    @DisplayName("a channel opened after the period ended is not paid at all")
    void skipsChannelOpenedAfterThePeriod() {
        fixedChannel.setCreatedAt(LocalDate.of(2026, 10, 3).atStartOfDay(ZoneOffset.UTC).toInstant());

        job.run(YearMonth.of(2026, 10));

        verify(payments, never()).monthly(eq(fixedChannel.getId()), any(), any(), any());
    }

    @Test
    @DisplayName("a closed channel is not paid")
    void skipsInactive() {
        when(channels.findByActiveTrueOrderBySubscriberCountDesc())
                .thenReturn(List.of(secondFixedChannel, percentChannel));

        job.run(YearMonth.of(2026, 10));

        verify(payments, never()).monthly(eq(fixedChannel.getId()), any(), any(), any());
    }

    @Test
    @DisplayName("one channel failing does not stop the rest")
    void oneFailureDoesNotStopTheRun() {
        doThrow(new RuntimeException("payment down"))
                .when(payments).monthly(eq(fixedChannel.getId()), any(), any(), any());

        job.run(YearMonth.of(2026, 10));

        verify(payments).monthly(eq(secondFixedChannel.getId()), any(), any(), any());
    }

    @Test
    @DisplayName("a zero monthly amount pays nothing rather than an empty transaction")
    void zeroAmountPaysNothing() {
        fixedChannel.setFixedMonthlySom(BigDecimal.ZERO);

        job.run(YearMonth.of(2026, 10));

        verify(payments, never()).monthly(eq(fixedChannel.getId()), any(), any(), any());
    }
}
