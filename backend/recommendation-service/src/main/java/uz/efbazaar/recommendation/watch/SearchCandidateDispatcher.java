package uz.efbazaar.recommendation.watch;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.recommendation.watch.SavedSearchDtos.Candidate;
import uz.efbazaar.recommendation.watch.SavedSearchDtos.Reason;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

/** The intent is the outbox: broker failure and process restart leave it pending for retry. */
@Component
public class SearchCandidateDispatcher {
    public static final String TOPIC="efbazaar.recommendation.watch-candidate";
    private final JdbcTemplate jdbc;
    private final KafkaTemplate<String,Object> kafka;
    public SearchCandidateDispatcher(JdbcTemplate jdbc,KafkaTemplate<String,Object> kafka) { this.jdbc=jdbc;this.kafka=kafka; }

    @Scheduled(fixedDelayString="${app.recommendation.watch.dispatch-delay-ms:1000}")
    @Transactional
    public void dispatch() {
        var intents=jdbc.query("""
            SELECT * FROM search_notification_intents WHERE dispatched_at IS NULL AND next_attempt_at<=now()
            ORDER BY next_attempt_at,id LIMIT 20 FOR UPDATE SKIP LOCKED
            """,(rs,n)->new Candidate("search:"+rs.getObject("user_id")+":"+rs.getObject("listing_id")+":"+rs.getLong("publication_version"),
                rs.getObject("id",UUID.class),rs.getObject("user_id",UUID.class),rs.getObject("listing_id",UUID.class),
                rs.getLong("publication_version"),rs.getTimestamp("published_at").toInstant(),java.util.List.of(),
                rs.getTimestamp("created_at").toInstant()));
        for(Candidate intent:intents) {
            var reasons=jdbc.query("""
                SELECT s.id,s.name FROM search_notification_reasons r JOIN saved_searches s ON s.id=r.search_id
                WHERE r.intent_id=? ORDER BY s.priority,s.id
                """,(rs,n)->new Reason(rs.getObject("id",UUID.class),rs.getString("name")),intent.intentId());
            Candidate event=new Candidate(intent.idempotencyKey(),intent.intentId(),intent.userId(),intent.listingId(),
                    intent.publicationVersion(),intent.publishedAt(),reasons,intent.occurredAt());
            try {
                kafka.send(TOPIC,intent.userId().toString(),event).get(5,TimeUnit.SECONDS);
                jdbc.update("UPDATE search_notification_intents SET dispatched_at=now(),attempts=attempts+1 WHERE id=?",intent.intentId());
            } catch(Exception failure) {
                if(failure instanceof InterruptedException) Thread.currentThread().interrupt();
                jdbc.update("""
                    UPDATE search_notification_intents SET attempts=attempts+1,
                        next_attempt_at=now()+make_interval(secs=>least(3600,power(2,least(attempts+1,11)))::double precision)
                    WHERE id=?
                    """,intent.intentId());
            }
        }
    }
}
