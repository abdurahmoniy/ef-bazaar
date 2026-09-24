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
    @Autowired uz.efbazaar.trade.trade.service.TradeSideService sideService;
    @Autowired uz.efbazaar.trade.mailbox.repository.MailboxRepository mailboxRepo;
    @Autowired uz.efbazaar.trade.trade.repository.TradeSideRepository sideRepo;

    @Test
    void buyerCanConfirmPayment_thenSellerChangesEmail() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        // WAITING_PAYMENT ga o'tkazamiz — odatda buni mock worker qiladi,
        // shuning uchun poygaga tushmaydigan yordamchi ishlatiladi.
        leaveInitiated(trades, t.id());

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/payment-confirmed").with(asUser(buyer)))
                .andExpect(status().isOk());
        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .isEqualTo(TradeState.WAITING_EMAIL_CHANGE);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/email-changed").with(asUser(seller)))
                .andExpect(status().isOk());
        // Ikkita holat ham to'g'ri: VERIFYING_KONAMI_LINK ga kirilganda
        // endi o'sha zahoti quti kuzatuvi ham boshlanadi va MockWorker
        // (haqiqiy worker kabi) tiklash xatini topib savdoni oldinga
        // suradi. Bu yerda muhimi — sotuvchining qadami e'lonni
        // WAITING_EMAIL_CHANGE dan chiqargani.
        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .isIn(TradeState.VERIFYING_KONAMI_LINK, TradeState.WAITING_PASSWORD);
    }

    /**
     * A swap asks every transfer step of both parties.
     *
     * <p>Reported from testing: the buyer changed their account's email, and
     * pressing the button came back "Only SELLER may perform this action".
     * These endpoints were written when only a sale existed, where each step
     * belongs to one side; on a swap the same step belongs to whoever is
     * doing it, and hard-coding the sale's owner locks the other party out of
     * their own half of the trade.
     */
    @Test
    void bothPartiesOfASwapMayDoTheirOwnTransferSteps() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        var t = trades.openTrade(UUID.randomUUID(), seller, buyer, 0L, null, null,
                UUID.randomUUID(), null, uz.efbazaar.trade.trade.domain.TradeMode.SMART,
                null, null, uz.efbazaar.trade.trade.domain.TradeKind.SWAP, 500_000L);
        reachEmailChange(t.id());

        // The party who happens to be the buyer is changing their own account's
        // email, exactly as the seller is changing theirs.
        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/email-changed").with(asUser(buyer)))
                .andExpect(status().isOk());
        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/email-changed").with(asUser(seller)))
                .andExpect(status().isOk());

        assertThat(repo.findById(t.id()).orElseThrow().getState())
                .as("both sides have done it, so the trade moves on")
                // Konami tekshiruvi endi avtomatik kuzatiladi, shuning
                // uchun mock uni darhol yopib qo'yishi mumkin.
                .isIn(TradeState.VERIFYING_KONAMI_LINK, TradeState.WAITING_PASSWORD);
    }

    /**
     * The other half of the same mistake, at the end of the trade.
     *
     * <p>A swap only crosses the accounts over when both parties say yes, and
     * the confirm endpoint was the buyer's alone — so the seller could never
     * give their half of the answer and no swap could ever complete.
     */
    @Test
    void theSellerOfASwapMayConfirmTheirHalf() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        var t = trades.openTrade(UUID.randomUUID(), seller, buyer, 0L, null, null,
                UUID.randomUUID(), null, uz.efbazaar.trade.trade.domain.TradeMode.SMART,
                null, null, uz.efbazaar.trade.trade.domain.TradeKind.SWAP, 500_000L);
        reachEmailChange(t.id());
        for (UUID who : new UUID[]{seller, buyer}) {
            drive(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.EMAIL_CHANGED, who);
        }
        seed(t.id(), TradeState.WAITING_BUYER_VERIFY);
        seedLoginCode(t.id(), uz.efbazaar.trade.trade.domain.ParticipantRole.SELLER);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/confirm").with(asUser(seller)))
                .andExpect(status().isOk());
    }

    /**
     * Akkountni ko'rmasdan tasdiqlab bo'lmaydi.
     *
     * <p>Kirish kodi "kirib ko'rdim" degan yagona belgi. U kelmaguncha
     * tasdiqlash yopiq; rad etish esa ochiq qoladi, chunki kira olmagan odam
     * aynan shuni bosadi.
     */
    @Test
    void confirmingBeforeTheLoginCodeIsRefused() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        var t = trades.openTrade(UUID.randomUUID(), seller, buyer, 0L, null, null,
                UUID.randomUUID(), null, uz.efbazaar.trade.trade.domain.TradeMode.SMART,
                null, null, uz.efbazaar.trade.trade.domain.TradeKind.SWAP, 500_000L);
        reachEmailChange(t.id());
        for (UUID who : new UUID[]{seller, buyer}) {
            drive(t.id(), uz.efbazaar.trade.trade.domain.TradeEvent.EMAIL_CHANGED, who);
        }
        seed(t.id(), TradeState.WAITING_BUYER_VERIFY);

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/confirm").with(asUser(seller)))
                .andExpect(status().isConflict());

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/reject").with(asUser(seller)))
                .andExpect(status().isOk());
    }

    /** Drives the trade to WAITING_EMAIL_CHANGE without leaning on Kafka timing. */
    private void reachEmailChange(UUID tradeId) {
        for (var side : sideService.of(tradeId)) {
            if (side.getMailboxId() == null) continue;
            var box = mailboxRepo.findById(side.getMailboxId()).orElseThrow();
            if (box.getEmail() == null || box.getEmail().startsWith("pending-")) {
                box.setEmail("trade-" + side.getMailboxId().toString().substring(0, 8)
                        + "@efbazaar.uz");
                box.setProvisionedAt(Instant.now());
                mailboxRepo.saveAndFlush(box);
            }
        }
        for (int i = 0; i < 20; i++) {
            TradeState now = repo.findById(tradeId).orElseThrow().getState();
            if (now == TradeState.WAITING_EMAIL_CHANGE) return;
            switch (now) {
                case INITIATED -> drive(tradeId,
                        uz.efbazaar.trade.trade.domain.TradeEvent.MAILBOX_PROVISIONED, null);
                case WAITING_PAYMENT -> drive(tradeId,
                        uz.efbazaar.trade.trade.domain.TradeEvent.PAYMENT_CONFIRMED, null);
                default -> throw new AssertionError("Unexpected state in setup: " + now);
            }
        }
        throw new AssertionError("Setup never reached WAITING_EMAIL_CHANGE");
    }

    /** MockWorker shares this trade over Kafka, so "already past it" is a pass. */
    private void drive(UUID tradeId, uz.efbazaar.trade.trade.domain.TradeEvent event, UUID actor) {
        try {
            trades.transition(tradeId, event,
                    actor == null ? uz.efbazaar.trade.trade.domain.ActorType.WORKER
                            : uz.efbazaar.trade.trade.domain.ActorType.USER,
                    actor);
        } catch (uz.efbazaar.trade.trade.exception.InvalidTradeTransitionException alreadyMoved) {
            // Someone else got there first, which is the outcome we wanted.
        }
    }

    /**
     * Kirish kodini qo'lda yozadi.
     *
     * <p>Holat seed qilinganda {@code onEnter} ishlamaydi, ya'ni IMAP
     * kuzatuvi so'ralmaydi va kod hech qachon kelmaydi. Jonli oqimda uni
     * worker yetkazadi (TradeE2EIT o'shani tekshiradi); bu yerda esa faqat
     * tekshirilayotgan qoidaga yo'l ochiladi.
     */
    private void seedLoginCode(UUID tradeId, uz.efbazaar.trade.trade.domain.ParticipantRole role) {
        var side = sideRepo.find(tradeId, role).orElseThrow();
        side.setLoginCode("447711");
        side.setLoginCodeAt(java.time.Instant.now());
        sideRepo.saveAndFlush(side);
    }

    private void seed(UUID tradeId, TradeState state) {
        var trade = repo.findById(tradeId).orElseThrow();
        trade.setState(state);
        repo.saveAndFlush(trade);
    }

    @Test
    void sellerCannotConfirmPayment() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer  = UUID.randomUUID();
        var t = trades.openTrade(seller, buyer, 500_000L,
                UUID.randomUUID(), UUID.randomUUID(), null);
        leaveInitiated(trades, t.id());

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
        leaveInitiated(trades, t.id());
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

    /**
     * A swap's two parties do not share one re-check budget.
     *
     * <p>Reported from testing: two users, one click each, and the second was
     * told "Recheck too soon". The limiter is keyed by trade alone, which was
     * right when a trade had one Konami flow in it. A swap has two — separate
     * mailboxes, separate resets — so one party's click was spending the
     * other's allowance and locking them out for five minutes.
     */
    @Test
    void eachPartyOfASwapHasTheirOwnRecheckAllowance() throws Exception {
        UUID seller = UUID.randomUUID();
        UUID buyer = UUID.randomUUID();
        var t = trades.openTrade(UUID.randomUUID(), seller, buyer, 0L, null, null,
                UUID.randomUUID(), null, uz.efbazaar.trade.trade.domain.TradeMode.SMART,
                null, null, uz.efbazaar.trade.trade.domain.TradeKind.SWAP, 500_000L);
        reachEmailChange(t.id());
        seedVerifyingKonamiLink(t.id());

        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/recheck").with(asUser(seller)))
                .andExpect(status().isOk());
        seedVerifyingKonamiLink(t.id());

        // The buyer has not re-checked at all yet, so this must go through.
        mvc.perform(post("/api/v1/trades/" + t.id() + "/actions/recheck").with(asUser(buyer)))
                .andExpect(status().isOk());
    }

    private void seedVerifyingKonamiLink(UUID tradeId) {
        var trade = repo.findById(tradeId).orElseThrow();
        trade.setState(uz.efbazaar.trade.trade.domain.TradeState.VERIFYING_KONAMI_LINK);
        trade.setStateDeadline(Instant.now().plusSeconds(1800));
        repo.save(trade);
    }

}
