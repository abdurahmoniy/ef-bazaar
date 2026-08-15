package uz.efbazaar.payment.notify;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.context.TestPropertySource;
import org.springframework.web.client.RestClient;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.config.BotClientConfig;
import uz.efbazaar.payment.health.UserbotHealth;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * If you have to choose between a missing Telegram message and a missing
 * credit, the message loses — every time.
 *
 * <p>Unlike {@link InvoiceNoticeIT}, which fakes the failure with a throwing
 * stub, this one drives the real {@link HttpBotClient} over a real socket
 * against the two outages that actually happen in production: {@code bot}
 * answering 500, and {@code bot} not listening at all. In both cases the
 * invoice must still be created and the deposit must still be credited.
 */
@SpringBootTest
@Import(DeadBotStillCreditsIT.SwitchableBotConfig.class)
@TestPropertySource(properties = {
        "payment.admin-telegram.enabled=true",
        // See the same note on InvoiceNoticeIT: this context consumes nothing,
        // and a listener it does not need would steal the card-credit and
        // heartbeat partitions from the two ITs that do.
        "spring.kafka.listener.auto-startup=false"
})
class DeadBotStillCreditsIT extends AbstractIntegrationIT {

    /**
     * A {@link BotClient} bean whose target the running test installs. One
     * Spring context can then serve both outages, which two different
     * {@code bot-base-url} properties could not.
     */
    static class SwitchableBot implements BotClient {
        static volatile BotClient delegate;

        @Override public OptionalLong sendDirectMessage(long chatId, String html) {
            return postPaymentNotice(html);
        }

        @Override public OptionalLong postPaymentNotice(String html) {
            return delegate.postPaymentNotice(html);
        }

        @Override public void deletePaymentNotice(long messageId) {
            delegate.deletePaymentNotice(messageId);
        }
    }

    @TestConfiguration
    static class SwitchableBotConfig {
        @Bean @Primary BotClient switchableBot() { return new SwitchableBot(); }
    }

    @Autowired InvoiceService invoiceService;
    @Autowired InvoiceRepository invoiceRepo;
    @Autowired ByCardService byCard;
    @Autowired CardCreditObservationRepository observations;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired UserbotHealth userbotHealth;
    @Autowired LedgerService ledger;

    private static final AtomicLong MSG = new AtomicLong(8_000_000);

    private HttpServer server;

    @BeforeEach
    void reset() {
        observations.deleteAll();
        invoiceRepo.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ KARIMOV", (short) 12, (short) 2030));
        userbotHealth.record(Instant.now());
    }

    @AfterEach
    void tearDown() {
        observations.deleteAll();
        SwitchableBot.delegate = null;
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }

    /** Wires the production client — production timeouts included — at a URL. */
    private void pointTheBotAt(String baseUrl) {
        RestClient http = new BotClientConfig().botRestClient(baseUrl, RestClient.builder());
        SwitchableBot.delegate = new HttpBotClient(http);
    }

    private String startAlwaysFailingServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            byte[] body = "{\"error\":\"kaput\"}".getBytes(StandardCharsets.UTF_8);
            ex.getResponseHeaders().add("Content-Type", "application/json");
            ex.sendResponseHeaders(500, body.length);
            try (OutputStream out = ex.getResponseBody()) {
                out.write(body);
            }
        });
        server.start();
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    private static String aClosedPort() throws IOException {
        try (ServerSocket s = new ServerSocket(0)) {
            return "http://127.0.0.1:" + s.getLocalPort();
        }
    }

    private void depositSurvives() {
        UUID user = UUID.randomUUID();

        var created = invoiceService.create(user, 100_000);
        Invoice pending = invoiceRepo.findById(created.id()).orElseThrow();
        assertThat(pending.getStatus()).isEqualTo(InvoiceStatus.PENDING);
        assertThat(pending.getAdminNoticeMessageId())
                .as("nothing was announced, and the row says so")
                .isNull();

        byCard.ingest(new CardCreditEvent(MSG.getAndIncrement(), "0101",
                pending.getTransferAmountTiyin(), 3_165_916L, Instant.now(), "🎉 To'ldirish ..."));

        assertThat(invoiceRepo.findById(created.id()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PAID);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(10_000_000);
    }

    @Test
    void aBotAnsweringFiveHundredCostsTheMessageAndNothingElse() throws Exception {
        pointTheBotAt(startAlwaysFailingServer());
        depositSurvives();
    }

    @Test
    void aBotThatIsNotListeningCostsTheMessageAndNothingElse() throws Exception {
        pointTheBotAt(aClosedPort());
        depositSurvives();
    }
}
