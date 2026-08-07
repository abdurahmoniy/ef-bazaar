package uz.efbazaar.trade.admin;

import jakarta.persistence.EntityNotFoundException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.dto.CloseConfirmResponse;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeCloseService;
import uz.efbazaar.trade.admin.service.TradeStepService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeTimeoutScheduler;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeCloseFlowIT extends AbstractIntegrationIT {

    @Autowired TradeCloseService closeService;
    @Autowired TradeStepService stepService;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeRepository trades;
    @Autowired TradeService tradeService;
    @Autowired TradeChatRepository chats;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired MailboxService mailboxes;
    @Autowired TradeTimeoutScheduler timeouts;

    private UUID adminId;
    private Trade trade;

    private void givenTradeInProgress() {
        adminId = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(adminId).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        trade = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(TradeState.WAITING_ADMIN)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(adminId)
                .adminFeeUzs(20_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(trade.getId()).participant(ParticipantRole.BUYER).build());
        assignments.accept(adminId, trade.getId());
    }

    private void markAllSteps() {
        for (TradeStep s : TradeStep.values()) {
            stepService.mark(trade.getId(), adminId, s, null);
        }
    }

    @Test
    void closeIsRefusedUntilAllSixStepsAreMarked() {
        givenTradeInProgress();
        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null);

        assertThatThrownBy(() -> closeService.adminClose(adminId, trade.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
        assertThat(trades.findById(trade.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.IN_PROGRESS);
    }

    @Test
    void closeWithSixOfSixMovesToWaitingCloseConfirm() {
        givenTradeInProgress();
        markAllSteps();

        closeService.adminClose(adminId, trade.getId());

        Trade after = trades.findById(trade.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_CLOSE_CONFIRM);
        assertThat(after.getAdminClosedAt()).isNotNull();
        assertThat(after.getStateDeadline()).isAfter(Instant.now());
    }

    @Test
    void oneConfirmationIsNotEnough() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        var result = closeService.confirm(trade.getSellerId(), trade.getId());

        assertThat(result.sellerConfirmed()).isTrue();
        assertThat(result.buyerConfirmed()).isFalse();
        assertThat(result.state()).isEqualTo(TradeState.WAITING_CLOSE_CONFIRM);
    }

    @Test
    void bothConfirmationsSucceedTheTrade() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        closeService.confirm(trade.getSellerId(), trade.getId());
        var result = closeService.confirm(trade.getBuyerId(), trade.getId());

        assertThat(result.state()).isEqualTo(TradeState.SUCCESS);
        assertThat(trades.findById(trade.getId()).orElseThrow().getTerminalReason())
                .isEqualTo("ADMIN_CLOSED_CONFIRMED");
        // The SUCCESS half of the mailbox handover: the admin held the escrow
        // inbox all through IN_PROGRESS and must not still hold it afterwards.
        assertThat(mailboxes.getRaw(trade.getMailboxId()).getOwnerUserId())
                .as("the buyer takes the escrow inbox on success; the admin loses it")
                .isEqualTo(trade.getBuyerId());
    }

    /**
     * The plan's own {@code bothConfirmationsSucceedTheTrade} calls confirm()
     * sequentially, which proves the happy-path logic but nothing about the
     * pessimistic lock — a lost-update race could still exist and that test
     * would stay green. This test actually races two threads against the
     * same trade row so the lock is exercised: without
     * {@code findByIdForUpdate} serialising the two writes, one thread's
     * UPDATE would clobber the other's confirmation timestamp (classic
     * lost-update) and neither call would observe both timestamps set, so
     * the trade would stay stuck in WAITING_CLOSE_CONFIRM forever and the
     * admin's completedCount would stay at 0.
     */
    @Test
    void simultaneousConfirmationsProduceExactlyOneSuccess() throws Exception {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);

        Future<CloseConfirmResponse> sellerCall = pool.submit(() -> {
            go.await();
            return closeService.confirm(trade.getSellerId(), trade.getId());
        });
        Future<CloseConfirmResponse> buyerCall = pool.submit(() -> {
            go.await();
            return closeService.confirm(trade.getBuyerId(), trade.getId());
        });
        go.countDown();

        CloseConfirmResponse sellerResult = sellerCall.get();
        CloseConfirmResponse buyerResult = buyerCall.get();
        pool.shutdown();

        List<TradeState> observedStates = List.of(sellerResult.state(), buyerResult.state());
        assertThat(observedStates)
                .as("exactly one of the two racing confirms must observe SUCCESS")
                .filteredOn(s -> s == TradeState.SUCCESS)
                .hasSize(1);

        assertThat(trades.findById(trade.getId()).orElseThrow().getState())
                .as("the row itself must have landed on SUCCESS, not stuck on a lost update")
                .isEqualTo(TradeState.SUCCESS);

        assertThat(profiles.findById(adminId).orElseThrow().getCompletedCount())
                .as("CLOSE_CONFIRMED must fire exactly once, not zero or twice")
                .isEqualTo(1);
    }

    @Test
    void confirmingTwiceIsIdempotent() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        closeService.confirm(trade.getSellerId(), trade.getId());
        var again = closeService.confirm(trade.getSellerId(), trade.getId());

        assertThat(again.sellerConfirmed()).isTrue();
        assertThat(again.state()).isEqualTo(TradeState.WAITING_CLOSE_CONFIRM);
    }

    @Test
    void theAdminCannotConfirmOnAPartysBehalf() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        // Pinned to the concrete type, not just RuntimeException: this is the
        // 404 contract TradeExceptionHandler maps EntityNotFoundException to —
        // an NPE or an IllegalArgumentException would satisfy a looser
        // assertion just as well while actually being a different bug.
        assertThatThrownBy(() -> closeService.confirm(adminId, trade.getId()))
                .isInstanceOf(EntityNotFoundException.class);
    }

    @Test
    void silenceForTwentyFourHoursStillSucceeds() {
        givenTradeInProgress();
        markAllSteps();
        closeService.adminClose(adminId, trade.getId());

        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setStateDeadline(Instant.now().minusSeconds(1));
        trades.save(t);

        timeouts.sweep();

        assertThat(trades.findById(trade.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.SUCCESS);
        assertThat(profiles.findById(adminId).orElseThrow().getCompletedCount())
                .as("the timeout route must credit the admin the same as an explicit confirm")
                .isEqualTo(1);
    }

    @Test
    void completingCreditsTheAdminsWorkTimeNotThePartiesLatency() {
        givenTradeInProgress();
        markAllSteps();

        // Pretend the admin worked for an hour, then the parties dawdled a day.
        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setAdminAcceptedAt(Instant.now().minus(Duration.ofDays(1).plusHours(1)));
        trades.save(t);
        closeService.adminClose(adminId, trade.getId());
        t = trades.findById(trade.getId()).orElseThrow();
        t.setAdminClosedAt(t.getAdminAcceptedAt().plus(Duration.ofHours(1)));
        trades.save(t);

        closeService.confirm(trade.getSellerId(), trade.getId());
        closeService.confirm(trade.getBuyerId(), trade.getId());

        TradeAdminProfile p = profiles.findById(adminId).orElseThrow();
        assertThat(p.getCompletedCount()).isEqualTo(1);
        assertThat(p.getTotalWorkSeconds()).isEqualTo(3600);
        assertThat(p.getTotalCloseSeconds())
                .as("close time includes the parties' latency, work time does not")
                .isGreaterThan(p.getTotalWorkSeconds());
        assertThat(p.averageWorkSeconds()).isEqualTo(3600);
    }

    @Test
    void cancellingCountsAgainstTheAdmin() {
        givenTradeInProgress();

        closeService.adminCancel(adminId, trade.getId(), "akkount qalbaki");

        assertThat(trades.findById(trade.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.REJECTED);
        assertThat(profiles.findById(adminId).orElseThrow().getCancelledCount())
                .isEqualTo(1);
    }

    @Test
    void smartTradeReachingSuccessDoesNotTouchAdminStatistics() {
        // A smart trade has no admin. The handler's SUCCESS case must skip the
        // stats write entirely rather than call it with a null id.
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade smart = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.WAITING_BUYER_VERIFY)
                .mailboxId(mailboxId)
                .sellerCardId(UUID.randomUUID())
                .buyerCardId(UUID.randomUUID())
                .mode(TradeMode.SMART)
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(smart.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(smart.getId()).participant(ParticipantRole.BUYER).build());
        long profilesBefore = profiles.count();

        // Drive the real smart-path transition through the handler.
        Trade after = tradeService.transition(smart.getId(), TradeEvent.BUYER_CONFIRM,
                ActorType.USER, smart.getBuyerId());

        assertThat(after.getState()).isEqualTo(TradeState.SUCCESS);
        assertThat(after.getTerminalReason())
                .as("smart trades keep their original terminal reason")
                .isEqualTo("BUYER_CONFIRMED");
        assertThat(profiles.count())
                .as("no phantom profile row was created for a null admin")
                .isEqualTo(profilesBefore);
    }
}
