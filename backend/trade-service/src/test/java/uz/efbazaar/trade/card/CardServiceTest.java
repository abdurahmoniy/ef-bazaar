package uz.efbazaar.trade.card;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import uz.efbazaar.trade.card.domain.Card;
import uz.efbazaar.trade.card.domain.CardBrand;
import uz.efbazaar.trade.card.dto.CardCreateRequest;
import uz.efbazaar.trade.card.exception.CardValidationException;
import uz.efbazaar.trade.card.repository.CardRepository;
import uz.efbazaar.trade.card.service.CardService;
import uz.efbazaar.trade.crypto.TradeCrypto;

import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class CardServiceTest {

    private CardRepository repo;
    private TradeCrypto crypto;
    private CardService service;

    @BeforeEach
    void setUp() {
        repo = mock(CardRepository.class);
        byte[] master = new byte[32];
        new SecureRandom().nextBytes(master);
        crypto = new TradeCrypto(() -> master);
        service = new CardService(repo, crypto);

        when(repo.save(any(Card.class))).thenAnswer(inv -> {
            Card c = inv.getArgument(0);
            if (c.getId() == null) {
                c.setId(UUID.randomUUID());
            }
            return c;
        });
    }

    @Test
    void createStoresLast4AndEncryptedPan() {
        UUID user = UUID.randomUUID();
        CardCreateRequest req = new CardCreateRequest(
                "4111111111111111", (short) 12, (short) 2027, CardBrand.VISA, "123", true);

        Card saved = service.create(user, req);

        assertThat(saved.getLast4()).isEqualTo("1111");
        assertThat(saved.getEncryptedPan()).isNotEmpty();
        assertThat(new String(saved.getEncryptedPan(), StandardCharsets.UTF_8))
                .doesNotContain("4111111111111111");
        assertThat(saved.isSavedToProfile()).isTrue();
        assertThat(saved.getEncryptedCvv()).isNotNull();  // Visa → CVV kept
    }

    @Test
    void createRejectsInvalidPan() {
        UUID user = UUID.randomUUID();
        CardCreateRequest req = new CardCreateRequest(
                "1234", (short) 12, (short) 2027, CardBrand.VISA, "123", true);

        assertThatThrownBy(() -> service.create(user, req))
                .isInstanceOf(CardValidationException.class)
                .hasMessageContaining("PAN");
    }

    @Test
    void createSkipsCvvForNonVisaCards() {
        UUID user = UUID.randomUUID();
        CardCreateRequest req = new CardCreateRequest(
                "5555555555554444", (short) 12, (short) 2027, CardBrand.MC, "999", false);

        Card saved = service.create(user, req);

        assertThat(saved.getEncryptedCvv()).isNull();
        assertThat(saved.getCvvIv()).isNull();
        assertThat(saved.getCvvTag()).isNull();
    }
}
