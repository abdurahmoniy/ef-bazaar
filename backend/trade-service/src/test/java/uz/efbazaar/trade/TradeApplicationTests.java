package uz.efbazaar.trade;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;

@SpringBootTest
class TradeApplicationTests extends AbstractIntegrationIT {

    @Test
    void contextLoads() {
        // Full context includes real Flyway-migrated Postgres, Kafka and Redis.
        // Scheduled handlers are active here and must use the same live fixtures.
    }
}
