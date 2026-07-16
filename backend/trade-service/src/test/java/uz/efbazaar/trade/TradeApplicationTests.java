package uz.efbazaar.trade;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractPostgresIT;

@SpringBootTest
class TradeApplicationTests extends AbstractPostgresIT {

    @Test
    void contextLoads() {
        // Full context with real Flyway-migrated Postgres.
    }
}
