package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.ads.PartnerAdRepositories.PartnerChannelRepository;
import uz.efbazaar.marketplace.partner.ads.PartnerPayoutPolicy.Mode;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneOffset;

/**
 * Fiks rejimdagi hamkorlarga oylik to'lov.
 *
 * <p>Har oyning 1-sanasida O'TGAN oy uchun to'laydi. Idempotentlik
 * kaliti payment tarafda {@code partner-monthly:<kanal>:<YYYY-MM>} —
 * 1-sanadagi qayta deploy yoki timeout'dan keyingi qayta urinish ikki
 * marta to'lamaydi.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PartnerMonthlyPayoutJob {

    private final PartnerChannelRepository channels;
    private final PartnerAdClient payments;
    private final PartnerPayoutPolicy policy;

    @Scheduled(cron = "${app.partners.monthly-cron:0 0 4 1 * *}", zone = "UTC")
    public void runForLastMonth() {
        run(YearMonth.now(ZoneOffset.UTC));
    }

    /** @param runMonth ishga tushish oyi; to'lov undan OLDINGI oy uchun. */
    public void run(YearMonth runMonth) {
        YearMonth period = runMonth.minusMonths(1);
        String periodKey = period.toString();

        for (PartnerChannel channel : channels.findByActiveTrueOrderBySubscriberCountDesc()) {
            var payout = policy.resolve(channel);
            if (payout.mode() != Mode.FIXED) continue;

            BigDecimal amount = proRated(payout.fixedMonthlySom(), channel, period);
            // Nol summa yozilmaydi: ledger nol harakatni rad etadi, va
            // "hech narsa to'lanmadi" ni yozib qo'yishning ma'nosi yo'q.
            if (amount.signum() <= 0) continue;

            try {
                payments.monthly(channel.getId(), channel.getPartnerUserId(), amount, periodKey);
                log.info("Hamkorga oylik to'landi: kanal={} summa={} davr={}",
                        channel.getId(), amount, periodKey);
            } catch (RuntimeException e) {
                // Bir kanalning yiqilishi qolganlarini to'xtatmaydi: ular
                // bir-biriga bog'liq emas. Keyingi ishga tushish
                // o'tkazib yuborilganini to'laydi va idempotentlik
                // kaliti hech kimga ikki marta to'lamaydi.
                log.error("Hamkorga oylik to'lanmadi: kanal={} davr={}",
                        channel.getId(), periodKey, e);
            }
        }
    }

    /**
     * Birinchi oy KUNLAR BO'YICHA bo'linadi.
     *
     * <p>O'n kun ishlagan hamkorga to'liq oy to'lansa, tasdiq sanasini
     * tanlash o'ynaladigan narsaga aylanardi.
     */
    private BigDecimal proRated(BigDecimal monthly, PartnerChannel channel, YearMonth period) {
        LocalDate opened = LocalDate.ofInstant(channel.getCreatedAt(), ZoneOffset.UTC);
        LocalDate periodEnd = period.atEndOfMonth();

        // Davr tugagandan keyin ochilgan kanalga bu oy uchun to'lanmaydi.
        if (opened.isAfter(periodEnd)) return BigDecimal.ZERO;
        if (opened.isBefore(period.atDay(1))) return monthly;

        int daysInMonth = period.lengthOfMonth();
        int daysCovered = daysInMonth - opened.getDayOfMonth() + 1;
        return monthly.multiply(BigDecimal.valueOf(daysCovered))
                .divide(BigDecimal.valueOf(daysInMonth), 2, RoundingMode.HALF_UP);
    }
}
