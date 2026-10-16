package uz.efbazaar.trade.testsupport;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import uz.efbazaar.trade.kafka.TradeEventPublisher;

/**
 * One Spring context for the custom-mailbox and link-session ITs.
 *
 * <p>Every distinct set of {@code @MockBean}s and properties builds its own
 * context with its own connection pool, and the shared Postgres container
 * runs out of clients. Keep these annotations identical across subclasses and
 * do not add {@code @MockBean}/{@code @SpyBean}/{@code @TestPropertySource}
 * in them. The publisher is mocked so MockWorker never answers a poll and
 * drives a session behind the test's back.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import(StubEscrowConfig.class)
public abstract class AbstractMailboxFeatureIT extends AbstractIntegrationIT {

    @MockBean protected TradeEventPublisher events;
}
