package uz.efbazaar.trade.trade;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.ActorType;
import uz.efbazaar.trade.trade.domain.TradeEvent;
import uz.efbazaar.trade.trade.service.OneTimePasswordService;
import uz.efbazaar.trade.trade.service.TradeService;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * HTTP-level coverage for the one-time password reveal endpoint, in particular
 * that a second reveal attempt is surfaced as a proper 4xx (410 Gone) rather
 * than a generic 500 — see Task 13 review, Critical/Minor #4.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PasswordRevealControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeService trades;
    @Autowired OneTimePasswordService otp;
    @Autowired uz.efbazaar.trade.trade.repository.TradeRepository repo;
    @Autowired uz.efbazaar.trade.trade.service.TradeSideService sideService;
    @Autowired uz.efbazaar.trade.mailbox.repository.MailboxRepository mailboxes;

    /**
     * On a swap each party reveals the password they were sent, not the one
     * they sent.
     *
     * <p>Reported from testing: both sides sent a password, the buyer revealed
     * theirs, and the seller's attempt came back "So'rov bajarilmadi". The
     * trade response resolved the password message from the buyer's chat
     * whoever asked, so the seller was handed an id belonging to a chat they
     * are not in — and the reveal, which authorises by finding the message in
     * the caller's own chat, could only refuse it.
     */
    @Test
    void eachPartyOfASwapRevealsTheirOwnPassword() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        var t = trades.openTrade(UUID.randomUUID(), seller, buyer, 0L, null, null,
                UUID.randomUUID(), null, uz.efbazaar.trade.trade.domain.TradeMode.SMART,
                null, null, uz.efbazaar.trade.trade.domain.TradeKind.SWAP, 500_000L);
        toWaitingPassword(t.id(), seller, buyer);

        // Each hands over the account they are giving up.
        UUID fromSeller = otp.sendPassword(t.id(), "SellersAccount1", seller);
        UUID fromBuyer = otp.sendPassword(t.id(), "BuyersAccount2", buyer);

        // The one each party is shown must be the one addressed to them.
        assertThat(trades.toResponseFor(t.id(), buyer).passwordMessageId())
                .as("the buyer opens the account the seller gave up")
                .isEqualTo(fromSeller);
        assertThat(trades.toResponseFor(t.id(), seller).passwordMessageId())
                .as("and the seller opens the one the buyer gave up")
                .isEqualTo(fromBuyer);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/messages/" + fromSeller + "/reveal")
                        .with(asUser(buyer)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/trades/" + t.id() + "/messages/" + fromBuyer + "/reveal")
                        .with(asUser(seller)))
                .andExpect(status().isOk());
    }

    /** Drives a swap to WAITING_PASSWORD, both sides having done every step. */
    private void toWaitingPassword(UUID tradeId, UUID seller, UUID buyer) {
        for (var side : sideService.of(tradeId)) {
            if (side.getMailboxId() == null) continue;
            var box = mailboxes.findById(side.getMailboxId()).orElseThrow();
            if (box.getEmail() == null || box.getEmail().startsWith("pending-")) {
                box.setEmail("trade-" + side.getMailboxId().toString().substring(0, 8)
                        + "@efbazaar.uz");
                box.setProvisionedAt(java.time.Instant.now());
                mailboxes.saveAndFlush(box);
            }
        }
        for (int i = 0; i < 30; i++) {
            var state = repo.findById(tradeId).orElseThrow().getState();
            if (state == uz.efbazaar.trade.trade.domain.TradeState.WAITING_PASSWORD) return;
            switch (state) {
                case INITIATED -> fire(tradeId, TradeEvent.MAILBOX_PROVISIONED, ActorType.WORKER, null);
                case WAITING_PAYMENT -> fire(tradeId, TradeEvent.PAYMENT_CONFIRMED, ActorType.SYSTEM, null);
                case WAITING_EMAIL_CHANGE -> {
                    fire(tradeId, TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
                    fire(tradeId, TradeEvent.EMAIL_CHANGED, ActorType.USER, buyer);
                }
                case VERIFYING_KONAMI_LINK -> {
                    fire(tradeId, TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);
                    fire(tradeId, TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);
                }
                default -> throw new AssertionError("Unexpected state in setup: " + state);
            }
        }
        throw new AssertionError("Setup never reached WAITING_PASSWORD");
    }

    /** MockWorker shares this trade over Kafka, so "already past it" is a pass. */
    private void fire(UUID tradeId, TradeEvent event, ActorType actor, UUID actorId) {
        try {
            trades.transition(tradeId, event, actor, actorId);
        } catch (uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException alreadyMoved) {
            // Someone else got there first, which is the outcome we wanted.
        }
    }

    @Test
    void secondRevealReturns410() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();

        var trade = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        leaveInitiated(trades, trade.id());
        trades.transition(trade.id(), TradeEvent.PAYMENT_CONFIRMED, ActorType.USER, buyer);
        trades.transition(trade.id(), TradeEvent.EMAIL_CHANGED, ActorType.USER, seller);
        trades.transition(trade.id(), TradeEvent.KONAMI_EMAIL_RECEIVED, ActorType.WORKER, null);

        UUID msgId = otp.sendPassword(trade.id(), "SuperSecret42", seller);

        String path = "/api/v1/trades/" + trade.id() + "/messages/" + msgId + "/reveal";

        mvc.perform(post(path).with(asUser(buyer)))
                .andExpect(status().isOk())
                .andExpect(content().json("{\"password\":\"SuperSecret42\"}"));

        mvc.perform(post(path).with(asUser(buyer)))
                .andExpect(status().isGone());
    }
}
