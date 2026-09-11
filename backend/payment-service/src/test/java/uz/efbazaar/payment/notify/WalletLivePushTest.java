package uz.efbazaar.payment.notify;

import org.junit.jupiter.api.Test;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import uz.efbazaar.payment.kafka.PaymentEventPublisher.DepositCreditedSignal;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;

class WalletLivePushTest {

    private record Sent(String destination, Object payload) {}

    @Test
    void aCreditedDepositIsPushedToThatUsersOwnDestination() {
        List<Sent> sent = new ArrayList<>();
        SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
        doAnswer(inv -> {
            sent.add(new Sent(inv.getArgument(0), inv.getArgument(1)));
            return null;
        }).when(messaging).convertAndSend(anyString(), any(Object.class));

        UUID user = UUID.randomUUID();
        UUID invoice = UUID.randomUUID();
        new WalletLivePush(messaging)
                .onDepositCredited(new DepositCreditedSignal(user, 10_000_000L, invoice));

        assertThat(sent).hasSize(1);
        assertThat(sent.get(0).destination()).isEqualTo("/topic/wallet/" + user);

        var push = (WalletLivePush.WalletCredited) sent.get(0).payload();
        assertThat(push.type()).isEqualTo("DEPOSIT_CREDITED");
        assertThat(push.invoiceId()).isEqualTo(invoice);
        // What reached the wallet, not what was transferred: a bumped invoice
        // asks for more, and showing that here would overstate the deposit.
        assertThat(push.amountTiyin()).isEqualTo(10_000_000L);
        assertThat(push.occurredAt()).isNotNull();
    }

    /**
     * The money has already moved by the time this runs. A closed socket, a
     * refusing broker, a serialization fault — none of them may reach a caller
     * whose transaction is committed.
     */
    @Test
    void aFailedPushNeverReachesTheCaller() {
        SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
        doThrow(new MessagingException("no subscribers"))
                .when(messaging).convertAndSend(anyString(), any(Object.class));

        assertThatCode(() -> new WalletLivePush(messaging).onDepositCredited(
                new DepositCreditedSignal(UUID.randomUUID(), 1L, UUID.randomUUID())))
                .doesNotThrowAnyException();
    }
}
