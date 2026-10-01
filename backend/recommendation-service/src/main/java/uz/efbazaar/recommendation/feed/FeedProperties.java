package uz.efbazaar.recommendation.feed;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

import java.math.BigDecimal;
import java.time.Duration;

/** Spec §4.4–4.5 konstantalari; prod ma'lumotiga qarab application.yml / env orqali sozlanadi. */
@ConfigurationProperties("app.recommendation.feed")
public record FeedProperties(
        @DefaultValue("1000") int maxIds,
        @DefaultValue("30m") Duration snapshotTtl,
        @DefaultValue("1.5") BigDecimal metaBoost,
        @DefaultValue("50") int profileLimit,
        @DefaultValue("30d") Duration interestWindow
) {
}
