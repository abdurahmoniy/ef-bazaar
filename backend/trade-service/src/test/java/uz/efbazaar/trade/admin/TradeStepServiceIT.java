package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeStepService;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeChatService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class TradeStepServiceIT extends AbstractIntegrationIT {

    @Autowired TradeStepService stepService;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeRepository trades;
    @Autowired TradeChatRepository chats;
    @Autowired TradeChatService chatService;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired MailboxService mailboxes;

    private UUID adminId;
    private Trade trade;

    private void givenAcceptedTrade() {
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

    @Test
    void checklistStartsAsSixUnmarkedStepsInDeclarationOrder() {
        givenAcceptedTrade();

        var list = stepService.list(trade.getId(), adminId);

        assertThat(list).hasSize(6);
        assertThat(list).extracting("step").containsExactly(
                TradeStep.SELLER_BRIEFED, TradeStep.ACCOUNT_TRANSFERRED,
                TradeStep.ACCOUNT_VERIFIED, TradeStep.PAYMENT_RECEIVED,
                TradeStep.CREDENTIALS_DELIVERED, TradeStep.SELLER_PAID);
        assertThat(list).allSatisfy(s -> assertThat(s.completed()).isFalse());
        assertThat(list.get(0).labelUz()).isEqualTo("Sotuvchi bilan gaplashdim");
    }

    @Test
    void marksMayBeAppliedInAnyOrder() {
        givenAcceptedTrade();

        // Payment first, briefing later — the whole point of the checklist.
        stepService.mark(trade.getId(), adminId, TradeStep.PAYMENT_RECEIVED, null);
        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, "telegramda");

        var list = stepService.list(trade.getId(), adminId);
        assertThat(list).filteredOn("completed", true)
                .extracting("step")
                .containsExactlyInAnyOrder(TradeStep.PAYMENT_RECEIVED, TradeStep.SELLER_BRIEFED);
        assertThat(list).filteredOn("step", TradeStep.SELLER_BRIEFED)
                .singleElement()
                .extracting("note").isEqualTo("telegramda");
    }

    @Test
    void markingPostsAStatusIntoBothChats() {
        givenAcceptedTrade();
        int before = chatService.list(trade.getId(), trade.getBuyerId()).size();

        stepService.mark(trade.getId(), adminId, TradeStep.ACCOUNT_VERIFIED, null);

        assertThat(chatService.list(trade.getId(), trade.getBuyerId()))
                .hasSizeGreaterThan(before);
        assertThat(chatService.list(trade.getId(), trade.getSellerId()))
                .anySatisfy(m -> assertThat(m.metadata())
                        .containsEntry("step", TradeStep.ACCOUNT_VERIFIED.name()));
    }

    @Test
    void markingReArmsTheEscalationWatchdog() {
        givenAcceptedTrade();
        Trade accepted = trades.findById(trade.getId()).orElseThrow();
        accepted.setEscalationDeadlineAt(Instant.now().minusSeconds(60));
        trades.save(accepted);

        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null);

        assertThat(trades.findById(trade.getId()).orElseThrow().getEscalationDeadlineAt())
                .as("a working admin must never reach the escalation queue")
                .isAfter(Instant.now());
    }

    @Test
    void unmarkingCorrectsAMistake() {
        givenAcceptedTrade();
        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_PAID, null);

        stepService.unmark(trade.getId(), adminId, TradeStep.SELLER_PAID);

        assertThat(stepService.list(trade.getId(), adminId))
                .filteredOn("step", TradeStep.SELLER_PAID)
                .singleElement()
                .satisfies(s -> {
                    assertThat(s.completed()).isFalse();
                    assertThat(s.completedAt()).isNull();
                });
        assertThat(stepService.allComplete(trade.getId())).isFalse();
    }

    @Test
    void markingTwiceIsIdempotent() {
        givenAcceptedTrade();
        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null);
        Instant first = stepService.list(trade.getId(), adminId).stream()
                .filter(s -> s.step() == TradeStep.SELLER_BRIEFED)
                .findFirst().orElseThrow().completedAt();

        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null);

        assertThat(stepService.list(trade.getId(), adminId).stream()
                .filter(s -> s.step() == TradeStep.SELLER_BRIEFED)
                .findFirst().orElseThrow().completedAt())
                .isEqualTo(first);
    }

    @Test
    void allCompleteOnlyWhenAllSixAreMarked() {
        givenAcceptedTrade();
        for (TradeStep s : TradeStep.values()) {
            if (s == TradeStep.SELLER_PAID) continue;
            stepService.mark(trade.getId(), adminId, s, null);
        }
        assertThat(stepService.allComplete(trade.getId())).isFalse();

        stepService.mark(trade.getId(), adminId, TradeStep.SELLER_PAID, null);

        assertThat(stepService.allComplete(trade.getId())).isTrue();
    }

    @Test
    void partiesCanReadButNotChangeTheChecklist() {
        givenAcceptedTrade();

        assertThat(stepService.list(trade.getId(), trade.getSellerId())).hasSize(6);
        assertThat(stepService.list(trade.getId(), trade.getBuyerId())).hasSize(6);

        assertThatThrownBy(() -> stepService.mark(
                trade.getId(), trade.getSellerId(), TradeStep.SELLER_BRIEFED, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void anotherAdminCannotTouchTheChecklist() {
        givenAcceptedTrade();
        UUID intruder = UUID.randomUUID();

        assertThatThrownBy(() -> stepService.mark(
                trade.getId(), intruder, TradeStep.SELLER_BRIEFED, null))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void checklistIsFrozenOnceTheTradeLeavesInProgress() {
        givenAcceptedTrade();
        Trade t = trades.findById(trade.getId()).orElseThrow();
        t.setState(TradeState.WAITING_CLOSE_CONFIRM);
        trades.save(t);

        assertThatThrownBy(() -> stepService.mark(
                trade.getId(), adminId, TradeStep.SELLER_BRIEFED, null))
                .isInstanceOf(ResponseStatusException.class);
    }
}
