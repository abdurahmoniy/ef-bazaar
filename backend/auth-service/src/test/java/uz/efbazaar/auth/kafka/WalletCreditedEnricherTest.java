package uz.efbazaar.auth.kafka;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.kafka.WalletCreditedEnricher.WalletCreditedNotification;
import uz.efbazaar.auth.repository.UserRepository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * Resolving who to tell that their wallet was topped up.
 *
 * <p>auth owns Telegram ids, so this is the only place the lookup happens — the
 * bot receives a denormalized event and never queries a user.
 */
@ExtendWith(MockitoExtension.class)
class WalletCreditedEnricherTest {

    private static final Instant AT = Instant.parse("2026-09-11T10:00:00Z");

    @Mock private UserRepository userRepository;
    @Mock private KafkaTemplate<String, Object> kafka;

    private WalletCreditedEnricher enricher;

    @BeforeEach
    void setUp() {
        enricher = new WalletCreditedEnricher(userRepository, kafka);
    }

    private static DepositCreditedDto event(UUID userId, UUID invoiceId, Long balance) {
        return new DepositCreditedDto(userId, 5_000_000L, invoiceId, UUID.randomUUID(), balance, AT);
    }

    @Test
    void aCreditedDepositIsRepublishedWithTheRecipientsTelegramId() {
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.of(
                User.builder().id(userId).telegramId(987_654_321L).build()));

        enricher.onDepositCredited(event(userId, UUID.randomUUID(), 32_000_000L));

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(kafka).send(eq(WalletCreditedEnricher.OUTPUT_TOPIC),
                eq(userId.toString()), payload.capture());

        WalletCreditedNotification sent = (WalletCreditedNotification) payload.getValue();
        assertThat(sent.recipientTelegramId()).isEqualTo(987_654_321L);
        assertThat(sent.amountTiyin()).isEqualTo(5_000_000L);
        assertThat(sent.balanceAfterTiyin()).isEqualTo(32_000_000L);
    }

    /**
     * A payment an admin attributed by hand carries no invoice. It is still a
     * deposit, and the person waiting on it is the one who most needs telling.
     */
    @Test
    void aManuallyAttributedPaymentIsAnnouncedJustTheSame() {
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.of(
                User.builder().id(userId).telegramId(111L).build()));

        enricher.onDepositCredited(event(userId, null, 900L));

        verify(kafka).send(eq(WalletCreditedEnricher.OUTPUT_TOPIC), eq(userId.toString()), org.mockito.ArgumentMatchers.any());
    }

    /**
     * A Google-only account has nowhere to send. The bell notification is
     * written by marketplace-service and reaches them there, so this path
     * simply stops rather than failing.
     */
    @Test
    void aUserWithNoTelegramLinkedGetsNoDm() {
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.of(
                User.builder().id(userId).telegramId(null).build()));

        enricher.onDepositCredited(event(userId, UUID.randomUUID(), 100L));

        verifyNoInteractions(kafka);
    }

    @Test
    void anUnknownUserIsDroppedRatherThanGuessed() {
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.empty());

        enricher.onDepositCredited(event(userId, UUID.randomUUID(), 100L));

        verifyNoInteractions(kafka);
    }

    @Test
    void aMalformedEventIsIgnoredRatherThanThrown() {
        enricher.onDepositCredited(null);
        enricher.onDepositCredited(new DepositCreditedDto(null, 1L, null, null, null, AT));
        enricher.onDepositCredited(
                new DepositCreditedDto(UUID.randomUUID(), null, null, null, null, AT));

        verifyNoInteractions(kafka);
    }

    /** An event with no timestamp must still go out — it is not the point of it. */
    @Test
    void aMissingTimestampIsFilledInRatherThanDroppingTheEvent() {
        UUID userId = UUID.randomUUID();
        when(userRepository.findById(userId)).thenReturn(Optional.of(
                User.builder().id(userId).telegramId(222L).build()));

        enricher.onDepositCredited(
                new DepositCreditedDto(userId, 1_000L, null, UUID.randomUUID(), null, null));

        ArgumentCaptor<Object> payload = ArgumentCaptor.forClass(Object.class);
        verify(kafka).send(eq(WalletCreditedEnricher.OUTPUT_TOPIC),
                eq(userId.toString()), payload.capture());
        assertThat(((WalletCreditedNotification) payload.getValue()).occurredAt()).isNotNull();
    }
}
