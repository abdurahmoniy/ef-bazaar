package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

/**
 * Spec §16.1 regression guards. These are the tests that stop the Konami
 * automation from wandering into a human trade.
 */
@SpringBootTest
class HumanModeSideEffectsIT extends AbstractIntegrationIT {

    @Autowired TradeRepository trades;
    @Autowired TradeService tradeService;
    @Autowired MailboxService mailboxes;
    @SpyBean TradeEventPublisher events;

    private Trade humanTradeInState(TradeState state, UUID admin) {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        return trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(state)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .adminFeeUzs(15_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
    }

    @Test
    void acceptingGivesTheAdminTheMailboxAndStartsTheWorkTimer() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);

        Trade after = tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);

        assertThat(after.getState()).isEqualTo(TradeState.IN_PROGRESS);
        assertThat(after.getAdminAcceptedAt()).isNotNull();
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId()).isEqualTo(admin);
    }

    @Test
    void inProgressCarriesNoStateDeadlineButAnEscalationDeadline() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);

        Trade after = tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);

        assertThat(after.getStateDeadline())
                .as("a state_deadline here makes the sweeper throw every 10s")
                .isNull();
        assertThat(after.getEscalationDeadlineAt()).isAfter(Instant.now());
    }

    @Test
    void humanTradeNeverTriggersKonamiOrImapAutomation() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);

        tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.ADMIN_CLOSED,
                ActorType.TRADE_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.CLOSE_CONFIRMED,
                ActorType.SYSTEM, null);

        verify(events, never()).forgotPasswordRequest(any(), any(), any());
        verify(events, never()).imapPollRequest(any(), any(), any());
    }

    @Test
    void closingRevokesTheAdminMailboxAccess() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.ADMIN_CLOSED,
                ActorType.TRADE_ADMIN, admin);

        Trade done = tradeService.transition(t.getId(), TradeEvent.CLOSE_CONFIRMED,
                ActorType.SYSTEM, null);

        assertThat(done.getState()).isEqualTo(TradeState.SUCCESS);
        assertThat(done.getTerminalReason()).isEqualTo("ADMIN_CLOSED_CONFIRMED");
        verify(events).mailboxRotateRequest(eq(t.getMailboxId()));
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId())
                .isEqualTo(done.getBuyerId());

        // Referal mukofoti shu hodisadan boshlanadi, va bu HUMAN savdo:
        // hamyonga tegmasa ham taraflar savdoni yakunlagan, mukofot esa
        // komissiya uchun emas, jalb qilingan foydalanuvchi uchun.
        verify(events).tradeSucceeded(argThat(published ->
                published.getId().equals(t.getId())));
    }

    @Test
    void declineClearsTheAssignmentAndStaysInWaitingAdmin() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);

        Trade after = tradeService.transition(t.getId(), TradeEvent.ADMIN_DECLINED,
                ActorType.TRADE_ADMIN, admin);

        assertThat(after.getState()).isEqualTo(TradeState.WAITING_ADMIN);
        assertThat(after.getAssignedAdminId()).isNull();
        assertThat(after.getAdminFeeUzs()).isNull();
        assertThat(after.getStateDeadline()).isAfter(Instant.now());
    }

    @Test
    void adminCancelRejectsAndReturnsTheMailboxToTheSeller() {
        UUID admin = UUID.randomUUID();
        Trade t = humanTradeInState(TradeState.WAITING_ADMIN, admin);
        tradeService.transition(t.getId(), TradeEvent.ADMIN_ACCEPTED,
                ActorType.TRADE_ADMIN, admin);

        Trade after = tradeService.transition(t.getId(), TradeEvent.ADMIN_CANCELLED,
                ActorType.TRADE_ADMIN, admin);

        assertThat(after.getState()).isEqualTo(TradeState.REJECTED);
        assertThat(after.getTerminalReason()).isEqualTo("ADMIN_CANCELLED");
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId())
                .isEqualTo(after.getSellerId());
    }
}
