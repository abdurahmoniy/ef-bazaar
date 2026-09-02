package uz.efbazaar.marketplace.referral;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.UUID;

/**
 * Referal mukofotini payment-service'ga yozdiradi.
 *
 * <p>Yo'nalish marketplace → payment, {@code PartnerFeeClient} bilan bir
 * xil. Teskarisi hech qachon qurilmaydi: payment savdoni yopish uchun
 * marketplace tirik bo'lishiga muhtoj bo'lmasligi kerak.
 *
 * <p>Xato YUTILMAYDI — {@link ReferralService} uni ushlaydi va qatorni
 * muhrlamaydi, shunda hodisa qayta yetkazilganda yana uriniladi.
 */
@Slf4j
@Component
public class ReferralRewardClient {

    /** payment-service tiyinda hisoblaydi, marketplace so'mda. */
    private static final BigDecimal TIYIN_PER_SOM = BigDecimal.valueOf(100);

    private final RestClient http;
    private final String secret;

    public ReferralRewardClient(
            @Value("${app.payment.internal-base-url:http://payment-service:8087}") String baseUrl,
            @Value("${app.internal.secret:}") String secret,
            RestClient.Builder builder) {
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout((int) Duration.ofSeconds(5).toMillis());
        factory.setReadTimeout((int) Duration.ofSeconds(20).toMillis());
        this.http = builder.baseUrl(baseUrl).requestFactory(factory).build();
        this.secret = secret;
    }

    public void reward(UUID referredUserId, UUID referrerUserId, BigDecimal rewardSom) {
        long tiyin = rewardSom.multiply(TIYIN_PER_SOM).setScale(0, RoundingMode.HALF_UP).longValue();
        // Nol mukofot — sozlama shunday qo'yilgan. So'rov yubormaymiz,
        // lekin bu xato emas: chaqiruvchi qatorni muhrlab qo'ya beradi.
        if (tiyin <= 0) return;

        http.post()
                .uri("/internal/referrals/reward")
                .header("X-Internal-Secret", secret)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new RewardRequest(referredUserId, referrerUserId, tiyin))
                .retrieve()
                .toBodilessEntity();
    }

    private record RewardRequest(UUID referredUserId, UUID referrerUserId, long rewardTiyin) {}
}
