package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.admin.domain.TradeAdminProfile;
import uz.efbazaar.trade.admin.repository.TradeAdminProfileRepository;
import uz.efbazaar.trade.admin.service.TradeAdminAssignmentService;
import uz.efbazaar.trade.admin.service.TradeEscalationSweeper;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.*;
import uz.efbazaar.trade.trade.repository.TradeChatRepository;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.hamcrest.Matchers.hasItem;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * HTTP-boundary coverage for {@link AdminTradeEscalationController}.
 * {@link TradeEscalationIT} exercises the service layer directly; this class
 * covers the two things only a real request proves: the {@code ROLE_ADMIN}
 * gate actually rejects a plain user, and the JSON the platform admin's
 * browser receives actually carries the fields a reassign/cancel decision
 * needs (not just whatever {@code TradeResponse} happens to expose).
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminTradeEscalationControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeAdminAssignmentService assignments;
    @Autowired TradeEscalationSweeper sweeper;
    @Autowired TradeRepository trades;
    @Autowired TradeChatRepository chats;
    @Autowired TradeAdminProfileRepository profiles;
    @Autowired MailboxService mailboxes;

    @Test
    void nonAdminIsForbidden() throws Exception {
        mvc.perform(get("/api/v1/admin/trades/escalated")
                        .with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }

    @Test
    void escalatedQueueExposesEnoughToDecide() throws Exception {
        UUID adminId = UUID.randomUUID();
        profiles.save(TradeAdminProfile.builder()
                .userId(adminId).minFeeUzs(15_000).maxFeeUzs(40_000).build());
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
        Trade accepted = trades.findById(t.getId()).orElseThrow();
        accepted.setEscalationDeadlineAt(Instant.now().minusSeconds(1));
        trades.save(accepted);
        sweeper.sweep();

        // Select by id, not by position. The queue is global and ordered by
        // escalatedAt ASC, so any other IT that escalates a trade against the
        // shared container lands ahead of this one — $[0] made the assertion
        // depend on test execution order, which is what broke it on CI.
        String mine = "$[?(@.id=='" + t.getId() + "')]";

        mvc.perform(get("/api/v1/admin/trades/escalated").with(asAdmin()))
                .andExpect(status().isOk())
                .andExpect(jsonPath(mine).exists())
                .andExpect(jsonPath(mine + ".assignedAdminId").value(hasItem(adminId.toString())))
                .andExpect(jsonPath(mine + ".adminFeeUzs").value(hasItem(20000)))
                .andExpect(jsonPath(mine + ".escalationReason").value(hasItem("ADMIN_IDLE")))
                .andExpect(jsonPath(mine + ".escalatedAt").exists());
    }
}
