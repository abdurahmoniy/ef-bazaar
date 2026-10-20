package uz.efbazaar.trade.mailbox.release;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import java.sql.Timestamp;
import java.time.*;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import uz.efbazaar.trade.kafka.TradeEvents;

/** Durable retry of the same immutable command, with bounded batch/lease and broker acknowledgement. */
@Component
@RequiredArgsConstructor
@Slf4j
public class MailboxDeletionDispatcher {
    private final JdbcTemplate jdbc;
    private final KafkaTemplate<String,Object> kafka;
    private final Clock clock;
    @Scheduled(fixedDelayString="${trade.mailbox.delete-dispatch-ms:60000}",initialDelayString="${trade.mailbox.delete-dispatch-ms:60000}")
    public void dispatch() {
        Instant now=clock.instant();
        var rows=jdbc.queryForList("UPDATE mailbox_deletion_requests SET next_dispatch_at=?,dispatch_attempts=dispatch_attempts+1 "
            +"WHERE id IN (SELECT id FROM mailbox_deletion_requests WHERE status='PENDING' AND next_dispatch_at<=? "
            +"ORDER BY next_dispatch_at LIMIT 100 FOR UPDATE SKIP LOCKED) RETURNING id,mailbox_id,email",
            Timestamp.from(now.plusSeconds(300)),Timestamp.from(now));
        for(var row:rows) {
            UUID id=(UUID)row.get("id");
            try {
                kafka.send(TradeEvents.TOPIC_MAILBOX_DELETE_REQ,row.get("mailbox_id").toString(),
                    new TradeEvents.MailboxDeleteRequest((UUID)row.get("mailbox_id"),(String)row.get("email"),id))
                    .get(10,TimeUnit.SECONDS);
                jdbc.update("UPDATE mailbox_deletion_requests SET last_publish_error=NULL WHERE id=?",id);
            } catch(Exception e) {
                if(e instanceof InterruptedException) Thread.currentThread().interrupt();
                jdbc.update("UPDATE mailbox_deletion_requests SET last_publish_error=? WHERE id=?",
                    e.getClass().getSimpleName(),id);
                log.warn("Mailbox deletion request {} remains queued: {}",id,e.getClass().getSimpleName());
            }
        }
    }
}
