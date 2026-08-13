package uz.efbazaar.payment.notify;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.client.RestClient;
import uz.efbazaar.payment.config.BotClientConfig;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * The real {@link HttpBotClient} against a real socket, because the failures
 * that matter here — a 500, a refused connection, a bot that accepts and then
 * hangs — only exist at the HTTP layer and a mocked client cannot produce them.
 *
 * <p>Every assertion is on the notifier's contract: whatever the bot does, the
 * caller sees an empty {@code OptionalLong} and no exception. That caller is
 * the invoice creation path, so an exception escaping here is a lost deposit.
 */
class HttpBotClientTest {

    private static final InvoiceNotice NOTICE = new InvoiceNotice(
            UUID.randomUUID(), UUID.randomUUID(), "4556", "ISMOILOV XUSNIDDIN",
            10_000_000L, 10_010_000L, Instant.parse("2026-08-12T15:41:00Z"), null);

    private HttpServer server;
    private ExecutorService pool;
    private final CountDownLatch release = new CountDownLatch(1);

    @AfterEach
    void stopServer() {
        release.countDown();
        if (server != null) server.stop(0);
        if (pool != null) pool.shutdownNow();
    }

    /** Builds the notifier exactly the way the Spring context does. */
    private AdminTelegramNotifier notifierAgainst(String baseUrl) {
        RestClient http = new BotClientConfig().botRestClient(baseUrl, RestClient.builder());
        AdminTelegramNotifier n = new AdminTelegramNotifier(new HttpBotClient(http));
        ReflectionTestUtils.setField(n, "enabled", true);
        return n;
    }

    private String startServer(com.sun.net.httpserver.HttpHandler handler) throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        pool = Executors.newCachedThreadPool();
        server.setExecutor(pool);
        server.createContext("/", handler);
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private static void respond(com.sun.net.httpserver.HttpExchange ex, int status, String body)
            throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        ex.getResponseHeaders().add("Content-Type", "application/json");
        ex.sendResponseHeaders(status, bytes.length);
        try (OutputStream out = ex.getResponseBody()) {
            out.write(bytes);
        }
    }

    private static int aClosedPort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return s.getLocalPort();
        }
    }

    @Test
    void aHealthyBotHandsBackTheTelegramMessageId() throws Exception {
        String url = startServer(ex -> respond(ex, 200, "{\"messageId\":4242}"));

        assertThat(notifierAgainst(url).invoiceCreated(NOTICE)).hasValue(4242L);
    }

    @Test
    void anUnconfiguredTopicComesBackAsNotAnnounced() throws Exception {
        // What PaymentNoticeController answers when TELEGRAM_TOPIC_PAYMENTS is unset.
        String url = startServer(ex -> respond(ex, 200, "{}"));

        assertThat(notifierAgainst(url).invoiceCreated(NOTICE)).isEmpty();
    }

    @Test
    void aBotAnsweringFiveHundredNeverThrowsAtTheCaller() throws Exception {
        String url = startServer(ex -> respond(ex, 500, "{\"error\":\"boom\"}"));
        AdminTelegramNotifier n = notifierAgainst(url);

        assertThatCode(() -> {
            assertThat(n.invoiceCreated(NOTICE)).isEmpty();
            assertThat(n.invoicePaid(NOTICE, 77L)).isEmpty();
            n.invoiceExpired(77L);
        }).doesNotThrowAnyException();
    }

    @Test
    void aBotThatIsNotListeningNeverThrowsAtTheCaller() throws Exception {
        AdminTelegramNotifier n = notifierAgainst("http://127.0.0.1:" + aClosedPort());

        assertThatCode(() -> {
            assertThat(n.invoiceCreated(NOTICE)).isEmpty();
            assertThat(n.invoicePaid(NOTICE, 77L)).isEmpty();
            n.invoiceExpired(77L);
        }).doesNotThrowAnyException();
    }

    /**
     * A bot that accepts the connection and then goes quiet is the worst case:
     * without a read timeout it parks the payment thread for as long as the
     * socket stays open. Three seconds, then give up.
     */
    @Test
    void aHangingBotGivesUpInsteadOfParkingThePaymentThread() throws Exception {
        AtomicInteger hits = new AtomicInteger();
        String url = startServer(ex -> {
            hits.incrementAndGet();
            try {
                release.await(60, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
            respond(ex, 200, "{\"messageId\":1}");
        });

        Instant started = Instant.now();
        AdminTelegramNotifier n = notifierAgainst(url);
        assertThat(n.invoiceCreated(NOTICE)).isEmpty();
        Duration took = Duration.between(started, Instant.now());

        assertThat(hits).hasValue(1);
        assertThat(took).isLessThan(Duration.ofSeconds(15));
    }
}
