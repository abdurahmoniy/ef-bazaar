package uz.efbazaar.trade;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest
@ActiveProfiles("test")
class TradeApplicationTests {

    @Test
    void contextLoads() {
        // Full context with H2 datasource, no Flyway.
    }
}
