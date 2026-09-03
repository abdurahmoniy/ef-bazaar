package uz.efbazaar.marketplace.partner.ads;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import uz.efbazaar.marketplace.partner.PartnerChannel;
import uz.efbazaar.marketplace.partner.PartnerRepositories.PartnerSettingsRepository;
import uz.efbazaar.marketplace.partner.PartnerSettings;

import java.math.BigDecimal;

/**
 * Kanalga qaysi to'lov sharti qo'llanishini hal qiladi.
 *
 * <p>Har maydon ALOHIDA tushadi: kanalda rejim ko'rsatilib foiz
 * ko'rsatilmagan bo'lsa, global foiz ishlaydi. Butun bloknni bir
 * butun sifatida almashtirsak, yarim to'ldirilgan override jimgina
 * nolga aylanardi.
 */
@Component
@RequiredArgsConstructor
public class PartnerPayoutPolicy {

    public enum Mode { PERCENT, FIXED }

    /**
     * @param tradePercentBp FIXED rejimda doim nol — fiks va foiz
     *                       bir-birini ALMASHTIRADI, ikkalasi ham
     *                       to'lansa hamkor ikki karra olardi.
     */
    public record Payout(Mode mode, int tradePercentBp, BigDecimal fixedMonthlySom) {}

    private final PartnerSettingsRepository settingsRepository;

    public Payout resolve(PartnerChannel channel) {
        PartnerSettings global = settingsRepository.findById(PartnerSettings.SINGLETON_ID)
                .orElseThrow(() -> new IllegalStateException("partner_settings qatori yo'q"));

        Mode mode = channel.getPayoutMode() == null
                ? Mode.valueOf(global.getDefaultPayoutMode())
                : Mode.valueOf(channel.getPayoutMode());

        BigDecimal fixed = channel.getFixedMonthlySom() == null
                ? global.getDefaultFixedMonthlySom()
                : channel.getFixedMonthlySom();

        if (mode == Mode.FIXED) {
            return new Payout(Mode.FIXED, 0, fixed);
        }

        int percentBp = channel.getTradePercentBp() == null
                ? global.getDefaultTradePercentBp()
                : channel.getTradePercentBp();
        return new Payout(Mode.PERCENT, percentBp, fixed);
    }
}
