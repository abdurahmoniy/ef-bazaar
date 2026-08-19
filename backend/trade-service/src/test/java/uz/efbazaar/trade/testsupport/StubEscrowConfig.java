package uz.efbazaar.trade.testsupport;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import uz.efbazaar.trade.payment.EscrowClient;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;

/**
 * Stands in for payment-service in trade tests that are not about money.
 *
 * <p>Without it every trade test would need a live wallet, and a suite that
 * cannot open a trade cannot test anything else. Holds succeed silently, so a
 * test that cares about escrow has to say so by overriding this.
 *
 * <p>{@link #calls} records what was asked for, so a test can assert that a
 * settle happened without needing a real ledger to look at.
 */
@TestConfiguration
public class StubEscrowConfig {

    /** "settle:<tradeId>" and friends, in the order they were requested. */
    public static final List<String> calls = new ArrayList<>();

    @Bean
    @Primary
    public EscrowClient stubEscrowClient() {
        EscrowClient stub = mock(EscrowClient.class);
        doAnswer(i -> calls.add("hold:" + i.getArgument(0)))
                .when(stub).hold(any(), any(), any(), anyLong(), anyLong());
        doAnswer(i -> calls.add("settle:" + i.getArgument(0)))
                .when(stub).settle(any(), any(), any(), anyLong(), anyLong());
        doAnswer(i -> calls.add("release:" + i.getArgument(0)))
                .when(stub).release(any(), any(), any(), anyLong(), anyLong());
        return stub;
    }
}
