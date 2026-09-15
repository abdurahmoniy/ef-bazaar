package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeCloseService;
import uz.efbazaar.trade.admin.service.TradeEscalationService;
import uz.efbazaar.trade.admin.service.TradeEscalationSweeper;
import uz.efbazaar.trade.admin.service.TradeStepService;
import uz.efbazaar.trade.kafka.TradeEventPublisher;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

@SpringBootTest
class TradeEscalationIT extends AbstractIntegrationIT {

    @Autowired TradeEscalationSweeper sweeper;
    @Autowired TradeEscalationService escalations;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeCloseService closeService;
    @Autowired TradeStepService stepService;
    @Autowired TradeRepository trades;
    @Autowired TradeChatRepository chats;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired MailboxService mailboxes;
    @Autowired uz.efbazaar.trade.trade.service.TradeService tradeService;
    @SpyBean TradeEventPublisher events;

    private UUID adminWithProfile() {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id).minFeeUzs(15_000).maxFeeUzs(40_000).build());
        return id;
    }

    private Trade acceptedTrade(UUID adminId) {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade t = trades.save(Trade.builder()
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
                .tradeId(t.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.BUYER).build());
        assignments.accept(adminId, t.getId());
        return trades.findById(t.getId()).orElseThrow();
    }

    private void makeIdle(UUID tradeId) {
        Trade t = trades.findById(tradeId).orElseThrow();
        t.setEscalationDeadlineAt(Instant.now().minusSeconds(1));
        trades.save(t);
    }

    @Test
    void idleAdminIsEscalatedWithoutChangingTheState() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());

        sweeper.sweep();

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getEscalatedAt()).isNotNull();
        assertThat(after.getEscalationReason()).isEqualTo("ADMIN_IDLE");
        assertThat(after.getState())
                .as("escalation is a flag, not a transition")
                .isEqualTo(TradeState.IN_PROGRESS);
    }

    @Test
    void aWorkingAdminIsNeverEscalated() {
        Trade t = acceptedTrade(adminWithProfile());
        // accept() armed the deadline in the future.

        sweeper.sweep();

        assertThat(trades.findById(t.getId()).orElseThrow().getEscalatedAt()).isNull();
    }

    @Test
    void escalationHappensOnlyOnce() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());
        sweeper.sweep();
        Instant first = trades.findById(t.getId()).orElseThrow().getEscalatedAt();

        sweeper.sweep();

        assertThat(trades.findById(t.getId()).orElseThrow().getEscalatedAt()).isEqualTo(first);
    }

    @Test
    void escalatedTradesShowUpInThePlatformQueue() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());
        sweeper.sweep();

        assertThat(escalations.listEscalated()).extracting("id").contains(t.getId());
    }

    @Test
    void reassigningRotatesTheMailboxAndBlamesTheOldAdmin() {
        UUID oldAdmin = adminWithProfile();
        Trade t = acceptedTrade(oldAdmin);
        makeIdle(t.getId());
        sweeper.sweep();
        UUID newAdmin = adminWithProfile();
        UUID platformAdmin = UUID.randomUUID();

        escalations.reassign(platformAdmin, t.getId(), newAdmin, 25_000L);

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_ADMIN);
        assertThat(after.getAssignedAdminId()).isEqualTo(newAdmin);
        assertThat(after.getAdminFeeUzs()).isEqualTo(25_000L);
        assertThat(after.getEscalatedAt()).isNull();
        assertThat(after.getAdminAcceptedAt())
                .as("the new admin's timer starts when they accept")
                .isNull();
        verify(events).mailboxRotateRequest(eq(t.getMailboxId()), org.mockito.ArgumentMatchers.anyString());
        assertThat(profiles.findById(oldAdmin).orElseThrow().getAbandonedCount()).isEqualTo(1);
        // The rotate alone achieves nothing: MailboxRotatedConsumer writes the
        // NEW password into the same mailbox row, and MailService authorises
        // purely on mailboxes.getOwned(userId, mailboxId). Leaving ownership on
        // the departed admin would hand them the freshly rotated credentials to
        // an inbox full of Konami password-reset mail.
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId())
                .as("the departed admin must lose mail.efbazaar.uz access immediately")
                .isNull();
    }

    /**
     * The other half of the reassignment handover: ownership is not merely
     * revoked, it lands on the admin who actually took the job.
     */
    @Test
    void theNewAdminOwnsTheMailboxOnlyOnceTheyAccept() {
        UUID oldAdmin = adminWithProfile();
        Trade t = acceptedTrade(oldAdmin);
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId()).isEqualTo(oldAdmin);
        makeIdle(t.getId());
        sweeper.sweep();
        UUID newAdmin = adminWithProfile();

        escalations.reassign(UUID.randomUUID(), t.getId(), newAdmin, 25_000L);
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId())
                .as("an invited admin owns nothing until they accept")
                .isNull();

        assignments.accept(newAdmin, t.getId());

        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId()).isEqualTo(newAdmin);
    }

    /**
     * The exit nobody covered: the reassigned-to admin never answers, the
     * WAITING_ADMIN deadline lapses, and the trade orphans. An admin who has
     * left the trade must lose the inbox — {@code MailService} authorises on
     * ownership alone, so leaving {@code owner_user_id} on them is permanent
     * read access to Konami password-reset mail for somebody else's account.
     *
     * <p>It goes to the seller rather than to nobody. The account in that
     * inbox is theirs, and a trade running out of time is not a reason to take
     * it away from them — a party who had already moved their account across
     * was otherwise locked out of it for good. Same ending as a rejected
     * trade, which has always handed the box back this way.
     */
    @Test
    void orphaningTakesTheEscrowMailboxOffTheAdminAndGivesItToTheSeller() {
        UUID oldAdmin = adminWithProfile();
        Trade t = acceptedTrade(oldAdmin);
        makeIdle(t.getId());
        sweeper.sweep();
        escalations.reassign(UUID.randomUUID(), t.getId(), adminWithProfile(), 25_000L);

        // Nobody accepts; the waiting window lapses.
        tradeService.transition(t.getId(), TradeEvent.TIMEOUT, ActorType.SYSTEM, null);

        assertThat(trades.findById(t.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.ORPHANED);
        var mb = mailboxes.getRaw(t.getMailboxId());
        assertThat(mb.getOwnerUserId())
                .as("never the admin, who has no claim on the account inside")
                .isNotEqualTo(oldAdmin);
        assertThat(mb.getOwnerUserId())
                .as("the account is the seller's, whatever became of the trade "
                        + "(trade=%s mailbox=%s handedOffAt=%s)",
                        t.getId(), t.getMailboxId(), mb.getHandedOffAt())
                .isEqualTo(t.getSellerId());
        assertThat(mb.getTradeId()).isNull();
    }

    /**
     * {@code findIdleHumanTrades} runs in its own read-only transaction, so the
     * rows the sweep batches are detached snapshots and each is written back in
     * its own later transaction. The old {@code trades.save(t)} was therefore a
     * merge that rewrote <em>every</em> column from that stale snapshot: an
     * admin who pressed close in the gap had {@code state} pushed from
     * WAITING_CLOSE_CONFIRM back to IN_PROGRESS and {@code admin_closed_at}
     * wiped — a finished trade resurrected into the platform queue after both
     * parties had already seen ADMIN_CLOSED in chat.
     */
    @Test
    void escalationSkipsATradeThatMovedSinceTheBatchWasRead() {
        Trade t = acceptedTrade(adminWithProfile());
        UUID adminId = t.getAssignedAdminId();
        makeIdle(t.getId());
        // Exactly what sweep() would hand escalateOne: a detached IN_PROGRESS row.
        Trade staleSnapshot = trades.findById(t.getId()).orElseThrow();

        // Meanwhile the admin turns up and finishes the job.
        for (TradeStep s : TradeStep.values()) {
            stepService.mark(t.getId(), adminId, s, null);
        }
        closeService.adminClose(adminId, t.getId());

        boolean escalated = sweeper.escalateOne(staleSnapshot);

        assertThat(escalated).isFalse();
        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState())
                .as("a finished trade must not be dragged back into IN_PROGRESS")
                .isEqualTo(TradeState.WAITING_CLOSE_CONFIRM);
        assertThat(after.getAdminClosedAt()).isNotNull();
        assertThat(after.getStateDeadline()).isNotNull();
        assertThat(after.getEscalatedAt()).isNull();
        assertThat(after.getEscalationReason()).isNull();
        assertThat(escalations.listEscalated()).extracting("id").doesNotContain(t.getId());
    }

    @Test
    void reassignedTradeIsHireableAgain() {
        UUID oldAdmin = adminWithProfile();
        Trade t = acceptedTrade(oldAdmin);
        makeIdle(t.getId());
        sweeper.sweep();
        UUID newAdmin = adminWithProfile();

        escalations.reassign(UUID.randomUUID(), t.getId(), newAdmin, 25_000L);
        assignments.accept(newAdmin, t.getId());

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.IN_PROGRESS);
        assertThat(after.getAdminAcceptedAt()).isNotNull();
    }

    @Test
    void platformAdminCanCancelInstead() {
        UUID oldAdmin = adminWithProfile();
        Trade t = acceptedTrade(oldAdmin);
        makeIdle(t.getId());
        sweeper.sweep();

        escalations.cancel(UUID.randomUUID(), t.getId(), "admin javob bermadi");

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.REJECTED);
        assertThat(mailboxes.getRaw(t.getMailboxId()).getOwnerUserId())
                .isEqualTo(after.getSellerId());
        // The brief itself flagged that this test "passes either way, but
        // cancelledCount would be wrong" if TradeStateHandler's actor guard
        // (recordCancelled only on actor == TRADE_ADMIN) regressed — pin both
        // counters so a regression there actually fails this test.
        TradeAdminProfile p = profiles.findById(oldAdmin).orElseThrow();
        assertThat(p.getAbandonedCount())
                .as("the admin went missing — that's abandonment, not a judgement call")
                .isEqualTo(1);
        assertThat(p.getCancelledCount())
                .as("a platform-initiated cancel must not double-count as the admin's own cancel")
                .isEqualTo(0);
    }

    @Test
    void reassigningToAPausedAdminIsRefused() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());
        sweeper.sweep();
        UUID paused = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(paused).minFeeUzs(15_000).maxFeeUzs(40_000)
                .acceptingOrders(false).build());

        assertThatThrownBy(() -> escalations.reassign(UUID.randomUUID(), t.getId(), paused, 20_000L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    @Test
    void reassigningANonEscalatedTradeIsRefused() {
        Trade t = acceptedTrade(adminWithProfile());
        // Never made idle, never swept — still plain IN_PROGRESS.

        assertThatThrownBy(() -> escalations.reassign(
                UUID.randomUUID(), t.getId(), adminWithProfile(), 20_000L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void reassigningASmartTradeIsRefused() {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade smart = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.WAITING_PAYMENT)
                .mailboxId(mailboxId)
                .sellerCardId(UUID.randomUUID())
                .buyerCardId(UUID.randomUUID())
                .mode(TradeMode.SMART)
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build());

        assertThatThrownBy(() -> escalations.reassign(
                UUID.randomUUID(), smart.getId(), adminWithProfile(), 20_000L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST));
    }

    /**
     * Directly exercises the defense-in-depth {@code state != IN_PROGRESS}
     * guard added to {@code requireEscalated} alongside the TradeStateHandler
     * fix (see {@code adminClosingAfterEscalationClearsItFromTheQueue}). This
     * row is synthetic — TradeStateHandler now always clears {@code
     * escalatedAt} on exit from IN_PROGRESS, so production code cannot
     * construct it — but {@code reassign()} writes with a raw {@code
     * setState()} that bypasses TradeStateMachine, so this guard is what
     * stands between a resurrected stale flag and reviving a finished trade.
     */
    @Test
    void reassigningATradeNoLongerInProgressIsRefused() {
        UUID admin = adminWithProfile();
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade stale = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.WAITING_CLOSE_CONFIRM)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .adminFeeUzs(15_000L)
                .escalatedAt(Instant.now().minusSeconds(30))
                .escalationReason("ADMIN_IDLE")
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());

        assertThatThrownBy(() -> escalations.reassign(
                UUID.randomUUID(), stale.getId(), adminWithProfile(), 20_000L))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        ex -> assertThat(ex.getStatusCode()).isEqualTo(HttpStatus.CONFLICT));
    }

    @Test
    void smartTradesAreNeverEscalated() {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade smart = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.WAITING_PAYMENT)
                .mailboxId(mailboxId)
                .sellerCardId(UUID.randomUUID())
                .buyerCardId(UUID.randomUUID())
                .mode(TradeMode.SMART)
                .escalationDeadlineAt(Instant.now().minusSeconds(1))
                .expiresAt(Instant.now().plus(Duration.ofHours(24)))
                .build());

        sweeper.sweep();

        assertThat(trades.findById(smart.getId()).orElseThrow().getEscalatedAt()).isNull();
    }

    /**
     * {@code findIdleHumanTrades} filters on {@code state = IN_PROGRESS}, not
     * merely "non-terminal" — so even a HUMAN trade sitting REJECTED with a
     * (hypothetically) stale, past {@code escalationDeadlineAt} must never be
     * picked up. In normal operation TradeStateHandler always nulls that
     * column on entry to REJECTED, so this row is synthetic — but the sweeper
     * query itself, not just upstream bookkeeping, is what must refuse it.
     */
    @Test
    void terminalHumanTradesAreNeverEscalated() {
        UUID mailboxId = mailboxes.createPlaceholder(
                "pending-" + UUID.randomUUID() + "@efbazaar.uz");
        Trade rejected = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(50_000)
                .state(TradeState.REJECTED)
                .mailboxId(mailboxId)
                .mode(TradeMode.HUMAN)
                .assignedAdminId(UUID.randomUUID())
                .adminFeeUzs(15_000L)
                .escalationDeadlineAt(Instant.now().minusSeconds(1))
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());

        sweeper.sweep();

        assertThat(trades.findById(rejected.getId()).orElseThrow().getEscalatedAt()).isNull();
    }

    /**
     * Composes two facts each already proven in isolation elsewhere
     * (TradeStepServiceIT#markingReArmsTheEscalationWatchdog re-arms a
     * lapsed deadline; this class's idleAdminIsEscalatedWithoutChangingTheState
     * proves the sweep escalates a lapsed one) into the actual end-to-end
     * claim: an admin who is still working, even after their old deadline
     * would have expired, does not get swept into the queue.
     */
    @Test
    void anAdminWhoKeepsWorkingStaysOutOfTheQueueEvenPastTheOriginalDeadline() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId()); // deadline already in the past

        stepService.mark(t.getId(), t.getAssignedAdminId(), TradeStep.SELLER_BRIEFED, null);
        sweeper.sweep();

        assertThat(trades.findById(t.getId()).orElseThrow().getEscalatedAt())
                .as("marking a step re-armed the deadline before the sweep ran")
                .isNull();
    }

    /**
     * Found while surveying who writes the Trade row after escalation: the
     * IN_PROGRESS -> WAITING_CLOSE_CONFIRM handler nulls escalationDeadlineAt
     * but, in the plan's own brief, never nulled escalatedAt/escalationReason.
     * Without a fix, an admin who shows up late and finishes the checklist
     * after being escalated would carry a stale escalatedAt all the way to
     * SUCCESS: the platform queue keeps showing a finished trade, and
     * TradeEscalationService.requireEscalated (which only checks
     * mode == HUMAN && escalatedAt != null, not state) would let a platform
     * admin call reassign() on it — forcibly resetting an already-successful
     * trade back to WAITING_ADMIN via a raw setState() that bypasses the
     * state machine entirely.
     */
    @Test
    void adminClosingAfterEscalationClearsItFromTheQueue() {
        Trade t = acceptedTrade(adminWithProfile());
        makeIdle(t.getId());
        sweeper.sweep();
        assertThat(trades.findById(t.getId()).orElseThrow().getEscalatedAt()).isNotNull();

        for (TradeStep s : TradeStep.values()) {
            stepService.mark(t.getId(), t.getAssignedAdminId(), s, null);
        }
        closeService.adminClose(t.getAssignedAdminId(), t.getId());

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_CLOSE_CONFIRM);
        assertThat(after.getEscalatedAt())
                .as("the admin finished the job; the platform queue must not still show it")
                .isNull();
        assertThat(after.getEscalationReason()).isNull();
        assertThat(escalations.listEscalated()).extracting("id").doesNotContain(t.getId());
    }
}
