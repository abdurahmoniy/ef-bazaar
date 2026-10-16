package uz.efbazaar.marketplace.kafka;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.account.ListingAccountLink;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AccountEmailVerifiedConsumerTest {

    @Mock ListingAccountLink accounts;
    @InjectMocks AccountEmailVerifiedConsumer consumer;

    @Test
    void handsTheEventToTheAccountLink() {
        var e = new AccountEmailVerifiedDto(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "alibek1@efbazaar.uz", true, Instant.now());
        when(accounts.applyVerifiedEmail(e)).thenReturn(Optional.empty());

        consumer.onVerified(e);

        verify(accounts).applyVerifiedEmail(e);
    }

    @Test
    void dropsAnEventWithoutAccount() {
        consumer.onVerified(new AccountEmailVerifiedDto(UUID.randomUUID(), null, UUID.randomUUID(),
                UUID.randomUUID(), "alibek1@efbazaar.uz", true, Instant.now()));

        verify(accounts, never()).applyVerifiedEmail(any());
    }
}
