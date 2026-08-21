package uz.efbazaar.trade.testsupport;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import uz.efbazaar.trade.payment.EscrowClient;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.function.Supplier;

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
 *
 * <h2>Why failures are injected here and not with {@code doThrow}</h2>
 *
 * <p>This is one mock, shared by every test in the context, and it is called
 * from threads the test does not control — Kafka listeners closing other
 * trades, the sweeper on its schedule. Re-stubbing it from a test body means
 * running Mockito's {@code when(...)} handshake while another thread is calling
 * the same mock, which corrupts that handshake and surfaces as
 * "UnfinishedStubbing detected" on whatever line happens to run next. It cost a
 * CI run to work that out from a stack trace pointing at innocent code.
 *
 * <p>{@link Mockito#reset} has the same problem and one of its own: it drops
 * the answers installed below, so afterwards nothing records into {@link #calls}
 * and every call silently returns null.
 *
 * <p>So the behaviour is installed once and driven by plain concurrent state:
 * {@link #failNext} arms a failure, {@link #clear} disarms everything. Tests may
 * still {@code verify(...)} — reading a mock is not the part that races.
 */
@TestConfiguration
public class StubEscrowConfig {

    /** "settle:&lt;tradeId&gt;" and friends, in the order they were requested. */
    public static final List<String> calls = new CopyOnWriteArrayList<>();

    /** Per-trade failures, keyed "hold:&lt;tradeId&gt;". */
    private static final Map<String, Supplier<RuntimeException>> failures = new ConcurrentHashMap<>();

    /** Failures armed for every trade, keyed by operation. */
    private static final Map<String, Supplier<RuntimeException>> failuresForAll = new ConcurrentHashMap<>();

    /**
     * Makes the next {@code operation} on this trade throw.
     *
     * @param tradeId the trade to fail on, or null for every trade — a test
     *                that acts before it knows the id has no other option
     */
    public static void failNext(String operation, UUID tradeId, Supplier<RuntimeException> boom) {
        if (tradeId == null) {
            failuresForAll.put(operation, boom);
        } else {
            failures.put(operation + ":" + tradeId, boom);
        }
    }

    /** Forgets recorded calls and any armed failure. */
    public static void clear() {
        calls.clear();
        failures.clear();
        failuresForAll.clear();
    }

    private static Object record(String operation, UUID tradeId) {
        Supplier<RuntimeException> boom = failures.get(operation + ":" + tradeId);
        if (boom == null) boom = failuresForAll.get(operation);
        if (boom != null) throw boom.get();
        calls.add(operation + ":" + tradeId);
        return null;
    }

    @Bean
    @Primary
    public EscrowClient stubEscrowClient() {
        EscrowClient stub = mock(EscrowClient.class);
        doAnswer(i -> record("hold", i.getArgument(0)))
                .when(stub).hold(any(), any(), any(), anyLong(), anyLong());
        doAnswer(i -> record("settle", i.getArgument(0)))
                .when(stub).settle(any(), any(), any(), anyLong(), anyLong());
        doAnswer(i -> record("release", i.getArgument(0)))
                .when(stub).release(any(), any(), any(), anyLong(), anyLong());
        return stub;
    }
}
