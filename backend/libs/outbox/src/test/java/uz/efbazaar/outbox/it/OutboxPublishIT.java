package uz.efbazaar.outbox.it;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.outbox.Outbox;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OutboxPublishIT extends AbstractOutboxIT {

    @Autowired Outbox outbox;
    @Autowired TransactionTemplate tx;

    @Test
    void publishOutsideTransactionIsRejected() {
        assertThatThrownBy(() -> outbox.publish("t", "k", Map.of("a", 1)))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> outbox.markSnapshot("listing", "L1"))
                .isInstanceOf(IllegalTransactionStateException.class);
    }

    @Test
    void committedPublishIsStored() {
        tx.executeWithoutResult(s -> outbox.publish("t", "k", Map.of("a", 1)));

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE topic = 't' AND message_key = 'k'", Long.class))
                .isEqualTo(1);
    }

    @Test
    void rolledBackPublishLeavesNothing() {
        tx.executeWithoutResult(s -> {
            outbox.publish("t", "k", Map.of("a", 1));
            outbox.markSnapshot("listing", "L1");
            s.setRollbackOnly();
        });

        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Long.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_snapshot_pending", Long.class)).isZero();
    }

    @Test
    void nullKeyIsAccepted() {
        tx.executeWithoutResult(s -> outbox.publish("t", null, Map.of("a", 1)));

        assertThat(jdbc.queryForObject(
                "SELECT count(*) FROM outbox_events WHERE message_key IS NULL", Long.class)).isEqualTo(1);
    }

    @Test
    void transactionOnAnotherDataSourceIsRejected() {
        // CardSearchService.atomic() kabi: boshqa DataSource ustida ochilgan tranzaksiya "faol",
        // lekin outbox yozuvi asosiy bazaga atomik bo'lmay tushardi.
        javax.sql.DataSource other = new org.springframework.jdbc.datasource.DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        TransactionTemplate otherTx = new TransactionTemplate(
                new org.springframework.jdbc.datasource.DataSourceTransactionManager(other));

        assertThatThrownBy(() -> otherTx.executeWithoutResult(s -> outbox.publish("t", "k", Map.of("a", 1))))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThatThrownBy(() -> otherTx.executeWithoutResult(s -> outbox.markSnapshot("listing", "L1")))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM outbox_events", Long.class)).isZero();
    }
}
