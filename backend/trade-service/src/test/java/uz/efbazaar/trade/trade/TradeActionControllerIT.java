package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeService;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

@SpringBootTest
@AutoConfigureMockMvc
class TradeActionControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired TradeService trades;
    @Autowired TradeRepository repo;

    @Test
    void buyerCanConfirmPayment_thenSellerChangesEmail() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        // Push it to WAITING_PAYMENT — normally the mock worker does this on email-provisioned.
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED,
                uz.efbazaar.trade.trade.domain.ActorType.SYSTEM, null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/payment-confirmed").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/email-changed").with(asUser(seller)))
                .andExpect(status().isOk());
        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.VERIFYING_KONAMI_LINK);
    }

    @Test
    void sellerCannotConfirmPayment() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED,
                uz.efbazaar.trade.trade.domain.ActorType.SYSTEM, null);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/payment-confirmed").with(asUser(seller)))
                .andExpect(status().isForbidden());
    }

    @Test
    void recheckIsRateLimited() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);

        // Drive to WAITING_EMAIL_CHANGE via the normal transitions.
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED,
                uz.efbazaar.trade.trade.domain.ActorType.SYSTEM, null);
        trades.transition(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.PAYMENT_CONFIRMED,
                uz.efbazaar.trade.trade.domain.ActorType.USER, buyer);

        // Seed state 4 (VERIFYING_KONAMI_LINK) directly instead of going
        // through EMAIL_CHANGED. EMAIL_CHANGED's onEnter publishes
        // forgot-password-request, which MockWorker answers in ~250ms with
        // konami-email-received — but that's not actually the race that
        // matters here: RECHECK itself calls events.imapPollRequest(...),
        // which MockWorker.onPollRequest answers near-instantly with its own
        // konami-email-received, genuinely (not spuriously) advancing
        // VERIFYING_KONAMI_LINK -> WAITING_PASSWORD after the very first
        // successful recheck. That's real business behaviour, not test
        // staleness, and it races the next loop iteration out from under us.
        //
        // This test only cares about RecheckRateLimiter's click-counting
        // (Redis-keyed purely by tradeId, independent of trade state), not
        // the async Konami handoff — so re-seed state 4 directly before each
        // call to neutralise the race instead of relying on it not firing.
        // 3 clicks allowed per application-test.yml (recheck.max-per-trade: 3), 4th should 429.
        for (int i = 0; i < 3; i++) {
            seedVerifyingKonamiLink(t.id());
            mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/recheck").with(asUser(seller)))
                    .andExpect(status().isOk());
            Thread.sleep(1100); // > min-interval-seconds: 1
        }
        seedVerifyingKonamiLink(t.id());
        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/recheck").with(asUser(seller)))
                .andExpect(status().isTooManyRequests());
    }

    private void seedVerifyingKonamiLink(UUID tradeId) {
        var trade = repo.findById(tradeId).orElseThrow();
        trade.setState(uz.efbazaar.trade.trade.domain.TradeState.VERIFYING_KONAMI_LINK);
        trade.setStateDeadline(Instant.now().plusSeconds(1800));
        repo.save(trade);
    }

}
