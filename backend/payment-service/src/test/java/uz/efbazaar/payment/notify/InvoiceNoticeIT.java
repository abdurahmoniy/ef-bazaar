package uz.efbazaar.payment.notify;

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
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.health.UserbotHealth;
import uz.efbazaar.payment.invoice.domain.Invoice;
import uz.efbazaar.payment.invoice.domain.InvoiceStatus;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.InvoiceExpirySweeper;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.observation.repository.CardCreditObservationRepository;
import uz.efbazaar.payment.observation.service.ByCardService;
import uz.efbazaar.payment.observation.service.ByCardService.CardCreditEvent;
import uz.efbazaar.payment.testsupport.AbstractIntegrationIT;
import uz.efbazaar.payment.wallet.service.LedgerService;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.OptionalLong;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The announcement lifecycle over the real event plumbing: created → posted,
 * paid → deleted and replaced, expired → deleted with nothing in its place.
 *
 * <p>Extends {@link AbstractIntegrationIT} rather than the Postgres-only base
 * because crediting publishes {@code efbazaar.payment.deposit-credited} from
 * inside the credit transaction — without a broker that send fails and rolls
 * the credit back, so the paid path cannot be exercised without Kafka.
 *
 * <p>Deliberately non-transactional: {@code @TransactionalEventListener} only
 * fires when a real transaction commits, and a {@code @Transactional} test
 * method never commits.
 */
@SpringBootTest
@Import(InvoiceNoticeIT.FakeBotConfig.class)
@TestPropertySource(properties = {
        "payment.admin-telegram.enabled=true",
        // This class drives ByCardService directly and consumes nothing. Left
        // running, its listeners would join payment-service-card-credit and
        // payment-service-userbot-heartbeat from a second Spring context and
        // take the single partition away from CardCreditConsumerIT and
        // HeartbeatConsumerIT, which need their own context's listener to own
        // it. The producer stays up — crediting still publishes.
        "spring.kafka.listener.auto-startup=false"
})
class InvoiceNoticeIT extends AbstractIntegrationIT {

    static class RecordingBot implements BotClient {
        final List<String> posted = new ArrayList<>();
        final List<Long> deleted = new ArrayList<>();
        volatile boolean explode;
        long nextId = 100;

        @Override public OptionalLong postPaymentNotice(String html) {
            if (explode) throw new IllegalStateException("bot is down");
            posted.add(html);
            return OptionalLong.of(nextId++);
        }

        @Override public void deletePaymentNotice(long messageId) {
            if (explode) throw new IllegalStateException("bot is down");
            deleted.add(messageId);
        }
    }

    @TestConfiguration
    static class FakeBotConfig {
        @Bean @Primary RecordingBot recordingBot() { return new RecordingBot(); }
    }

    @Autowired RecordingBot bot;
    @Autowired InvoiceService invoiceService;
    @Autowired InvoiceRepository invoiceRepo;
    @Autowired InvoiceExpirySweeper sweeper;
    @Autowired ByCardService byCard;
    @Autowired CardCreditObservationRepository observations;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;
    @Autowired UserbotHealth userbotHealth;
    @Autowired LedgerService ledger;

    private static final AtomicLong MSG = new AtomicLong(9_000_000);

    @BeforeEach
    void reset() {
        bot.posted.clear();
        bot.deleted.clear();
        bot.explode = false;
        bot.nextId = 100;

        observations.deleteAll();
        invoiceRepo.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "AZIZ KARIMOV", (short) 12, (short) 2030));
        userbotHealth.record(Instant.now());
    }

    /** card_credit_observations.invoice_id has an FK to invoices — see ByCardServiceIT. */
    @AfterEach
    void leaveNoObservationsBehind() {
        observations.deleteAll();
    }

    private CardCreditEvent event(long amountTiyin) {
        return new CardCreditEvent(MSG.getAndIncrement(), "0101", amountTiyin,
                3_165_916L, Instant.now(), "🎉 To'ldirish ...");
    }

    @Test
    void creatingAnInvoiceStoresTheNoticeId() {
        var created = invoiceService.create(UUID.randomUUID(), 100_000);

        assertThat(bot.posted).hasSize(1);
        assertThat(bot.posted.get(0)).contains("Yangi to'ldirish").contains("•••• 0101");
        assertThat(invoiceRepo.findById(created.id()).orElseThrow().getAdminNoticeMessageId())
                .isEqualTo(100L);
    }

    @Test
    void payingReplacesTheNotice() {
        UUID user = UUID.randomUUID();
        var created = invoiceService.create(user, 100_000);
        Invoice pending = invoiceRepo.findById(created.id()).orElseThrow();

        byCard.ingest(event(pending.getTransferAmountTiyin()));

        assertThat(bot.deleted).containsExactly(100L);
        assertThat(bot.posted).hasSize(2);
        assertThat(bot.posted.get(1)).contains("amalga oshirildi");

        Invoice paid = invoiceRepo.findById(created.id()).orElseThrow();
        assertThat(paid.getStatus()).isEqualTo(InvoiceStatus.PAID);
        assertThat(paid.getAdminNoticeMessageId()).isEqualTo(101L);
    }

    @Test
    void expiringDeletesTheNoticeAndPostsNothing() {
        var created = invoiceService.create(UUID.randomUUID(), 100_000);
        Invoice inv = invoiceRepo.findById(created.id()).orElseThrow();
        inv.setExpiresAt(Instant.now().minusSeconds(1));
        invoiceRepo.save(inv);
        bot.posted.clear();

        sweeper.sweep();

        assertThat(bot.deleted).containsExactly(100L);
        assertThat(bot.posted).isEmpty();
        assertThat(invoiceRepo.findById(created.id()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.EXPIRED);
    }

    /**
     * The test that guards the rule. Without it, a future refactor that lets the
     * notifier throw would pass every other test in this file.
     */
    @Test
    void aDeadBotStillCreatesTheInvoiceAndCreditsTheWallet() {
        bot.explode = true;
        UUID user = UUID.randomUUID();

        var created = invoiceService.create(user, 100_000);
        Invoice pending = invoiceRepo.findById(created.id()).orElseThrow();
        assertThat(pending.getAdminNoticeMessageId()).isNull();

        byCard.ingest(event(pending.getTransferAmountTiyin()));

        assertThat(invoiceRepo.findById(created.id()).orElseThrow().getStatus())
                .isEqualTo(InvoiceStatus.PAID);
        assertThat(ledger.balanceOf(user).getAvailableTiyin()).isEqualTo(10_000_000);
    }
}
