package uz.efbazaar.recommendation.maintenance;

import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import uz.efbazaar.recommendation.interest.UserCardInterestRepository;

import java.time.Duration;

/**
 * Kunlik tozalash: shaxsiy qiziqish 90 kun (agregat sanagichlar bilan bir xil), qayta ishlangan
 * event kalitlari 30 kun — undan eski takrorni baribir {@code version} to'sadi.
 */
@Slf4j
@Component
public class RetentionJob {

    static final Duration INTEREST_RETENTION = Duration.ofDays(90);

    private final UserCardInterestRepository userInterest;
    private final JdbcTemplate jdbc;

    public RetentionJob(UserCardInterestRepository userInterest, JdbcTemplate jdbc) {
        this.userInterest = userInterest;
        this.jdbc = jdbc;
    }

    @Scheduled(cron = "${app.recommendation.retention-cron:0 30 3 * * *}", zone = "UTC")
    public void run() {
        int interest = userInterest.deleteOlderThan(INTEREST_RETENTION);
        int events = jdbc.update("DELETE FROM consumed_events WHERE consumed_at < now() - interval '30 days'");
        log.info("Retention: user_card_interest -{} , consumed_events -{}", interest, events);
    }
}
