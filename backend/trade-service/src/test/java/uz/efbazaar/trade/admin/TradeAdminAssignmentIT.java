package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.repository.TradeStepMarkRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeChatService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeAdminAssignmentIT extends AbstractIntegrationIT {

    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeRepository trades;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired TradeStepMarkRepository steps;
    @Autowired TradeChatService chatService;
    @Autowired MailboxService mailboxes;
    @Autowired uz.efbazaar.trade.trade.repository.TradeChatRepository chats;

    private UUID admin(int concurrent) {
        UUID id = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(id).minFeeUzs(15_000).maxFeeUzs(40_000)
                .maxConcurrentTrades(concurrent).build());
        return id;
    }

    private Trade waitingAdminTrade(UUID adminId) {
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
                .stateDeadline(Instant.now().plus(Duration.ofHours(24)))
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.SELLER).build());
        chats.save(TradeChat.builder().id(UUID.randomUUID())
                .tradeId(t.getId()).participant(ParticipantRole.BUYER).build());
        return t;
    }

    @Test
    void acceptingCreatesSixStepsAndMovesToInProgress() {
        UUID adminId = admin(3);
        Trade t = waitingAdminTrade(adminId);

        assignments.accept(adminId, t.getId());

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.IN_PROGRESS);
        assertThat(steps.findByTradeIdOrderByStep(t.getId()))
                .hasSize(6)
                .allSatisfy(s -> assertThat(s.isComplete()).isFalse());
    }

    @Test
    void acceptingPostsAStatusMessageIntoBothChats() {
        UUID adminId = admin(3);
        Trade t = waitingAdminTrade(adminId);

        assignments.accept(adminId, t.getId());

        assertThat(chatService.list(t.getId(), t.getSellerId()))
                .anySatisfy(m -> assertThat(m.messageType()).isEqualTo(TradeMessageType.STATUS));
        assertThat(chatService.list(t.getId(), t.getBuyerId()))
                .anySatisfy(m -> assertThat(m.messageType()).isEqualTo(TradeMessageType.STATUS));
    }

    @Test
    void anAdminWhoWasNotInvitedCannotAccept() {
        UUID invited = admin(3);
        UUID other = admin(3);
        Trade t = waitingAdminTrade(invited);

        assertThatThrownBy(() -> assignments.accept(other, t.getId()))
                .isInstanceOf(RuntimeException.class);
        assertThat(trades.findById(t.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_ADMIN);
    }

    @Test
    void acceptingWhenFullIsRejectedAndLeavesTheTradeWaiting() {
        UUID adminId = admin(1);
        Trade busyWith = waitingAdminTrade(adminId);
        assignments.accept(adminId, busyWith.getId());     // now at 1/1

        Trade second = waitingAdminTrade(adminId);

        assertThatThrownBy(() -> assignments.accept(adminId, second.getId()))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("409");
        assertThat(trades.findById(second.getId()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_ADMIN);
    }

    @Test
    void twoSimultaneousAcceptsCannotBothWin() throws Exception {
        UUID adminId = admin(1);
        Trade a = waitingAdminTrade(adminId);
        Trade b = waitingAdminTrade(adminId);

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);

        Future<Boolean> f1 = pool.submit(() -> {
            go.await();
            try { assignments.accept(adminId, a.getId()); return true; }
            catch (Exception e) { return false; }
        });
        Future<Boolean> f2 = pool.submit(() -> {
            go.await();
            try { assignments.accept(adminId, b.getId()); return true; }
            catch (Exception e) { return false; }
        });
        go.countDown();

        int winners = (f1.get() ? 1 : 0) + (f2.get() ? 1 : 0);
        pool.shutdown();

        assertThat(winners)
                .as("maxConcurrentTrades=1 must admit exactly one")
                .isEqualTo(1);
    }

    @Test
    void decliningClearsTheAssignmentAndKeepsTheTradeHireable() {
        UUID adminId = admin(3);
        Trade t = waitingAdminTrade(adminId);

        assignments.decline(adminId, t.getId());

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_ADMIN);
        assertThat(after.getAssignedAdminId()).isNull();
        assertThat(steps.findByTradeIdOrderByStep(t.getId())).isEmpty();
    }

    @Test
    void sellerCanInviteAnotherAdminAfterADecline() {
        UUID first = admin(3);
        Trade t = waitingAdminTrade(first);
        assignments.decline(first, t.getId());
        UUID second = admin(3);

        assignments.assign(t.getSellerId(), t.getId(), second, 25_000L);

        Trade after = trades.findById(t.getId()).orElseThrow();
        assertThat(after.getAssignedAdminId()).isEqualTo(second);
        assertThat(after.getAdminFeeUzs()).isEqualTo(25_000L);
        assertThat(after.getState()).isEqualTo(TradeState.WAITING_ADMIN);
    }

    @Test
    void buyerCannotInviteAnAdmin() {
        UUID first = admin(3);
        Trade t = waitingAdminTrade(first);
        assignments.decline(first, t.getId());
        UUID second = admin(3);

        assertThatThrownBy(() -> assignments.assign(t.getBuyerId(), t.getId(), second, 25_000L))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void cannotInviteWhileAnAdminIsAlreadyAssigned() {
        UUID first = admin(3);
        Trade t = waitingAdminTrade(first);
        UUID second = admin(3);

        assertThatThrownBy(() -> assignments.assign(t.getSellerId(), t.getId(), second, 25_000L))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void invitationsListShowsOnlyTradesWaitingOnThisAdmin() {
        UUID adminId = admin(3);
        Trade mine = waitingAdminTrade(adminId);
        waitingAdminTrade(admin(3));           // somebody else's invitation

        var invitations = assignments.listInvitations(adminId);

        assertThat(invitations).extracting("id").containsExactly(mine.getId());
    }
}
