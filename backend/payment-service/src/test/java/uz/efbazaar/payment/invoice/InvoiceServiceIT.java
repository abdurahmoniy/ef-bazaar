package uz.efbazaar.payment.invoice;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.repository.PlatformCardAuditRepository;
import uz.efbazaar.payment.card.repository.PlatformCardRepository;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.invoice.repository.InvoiceRepository;
import uz.efbazaar.payment.invoice.service.InvoiceService;
import uz.efbazaar.payment.testsupport.AbstractPostgresIT;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class InvoiceServiceIT extends AbstractPostgresIT {

    @Autowired InvoiceService invoices;
    @Autowired InvoiceRepository invoiceRepo;
    @Autowired PlatformCardService cards;
    @Autowired PlatformCardRepository cardRepo;
    @Autowired PlatformCardAuditRepository auditRepo;

    @BeforeEach
    void clean() {
        invoiceRepo.deleteAll();
        auditRepo.deleteAll();
        cardRepo.deleteAll();
        cards.create(UUID.randomUUID(), new PlatformCardCreateRequest(
                "9860160101080101", "aziz karimov", (short) 12, (short) 2030));
    }

    @Test
    void anInvoiceCarriesEverythingThePayerNeeds() {
        var res = invoices.create(UUID.randomUUID(), 100_000);

        assertThat(res.pan()).isEqualTo("9860160101080101");
        assertThat(res.holderName()).isEqualTo("AZIZ KARIMOV");
        assertThat(res.cardExpiry()).isEqualTo("12/30");
        assertThat(res.transferTiyin()).isEqualTo(10_000_000);
        assertThat(res.requestedTiyin()).isEqualTo(10_000_000);
        assertThat(res.expiresAt()).isNotNull();
    }

    @Test
    void belowTheMinimumIsRefused() {
        assertThatThrownBy(() -> invoices.create(UUID.randomUUID(), 500))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("400");
    }

    @Test
    void aUserMayOnlyHaveOneLiveInvoice() {
        UUID user = UUID.randomUUID();
        invoices.create(user, 100_000);

        assertThatThrownBy(() -> invoices.create(user, 50_000))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
    }

    @Test
    void myActiveReturnsTheLiveInvoice() {
        UUID user = UUID.randomUUID();
        var created = invoices.create(user, 100_000);

        assertThat(invoices.myActive(user)).isPresent()
                .get().extracting(x -> x.id()).isEqualTo(created.id());
        assertThat(invoices.myActive(UUID.randomUUID())).isEmpty();
    }
}
