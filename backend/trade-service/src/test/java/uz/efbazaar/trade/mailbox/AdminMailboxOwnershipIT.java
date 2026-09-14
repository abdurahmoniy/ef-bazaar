package uz.efbazaar.trade.mailbox;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.mailbox.repository.MailboxRepository;
import uz.efbazaar.trade.mailbox.service.MailboxService;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;
import uz.efbazaar.trade.trade.service.TradeSideService;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asAdmin;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * Admin detaching a mailbox or handing it to someone else, against a real
 * database — the live-trade guard is a JPQL query that no mock can vouch for.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminMailboxOwnershipIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired MailboxService mailboxService;
    @Autowired MailboxRepository mailboxes;
    @Autowired TradeRepository trades;
    @Autowired TradeSideService sides;

    private UUID ownedBox(UUID owner) {
        UUID id = mailboxService.createPlaceholder("box-" + UUID.randomUUID() + "@efbazaar.uz");
        mailboxService.assignOwner(id, owner);
        return id;
    }

    /** A trade in {@code state} whose seller side uses {@code sellerBox} and buyer side {@code buyerBox}. */
    private void tradeUsing(TradeState state, UUID sellerBox, UUID buyerBox) {
        Trade t = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(UUID.randomUUID())
                .buyerId(UUID.randomUUID())
                .priceUzs(80_000)
                .state(state)
                .mailboxId(sellerBox)
                .mode(TradeMode.SMART)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());
        sides.open(t.getId(), sellerBox, buyerBox);
    }

    private static String owner(UUID id) {
        return "{\"ownerUserId\":\"" + id + "\"}";
    }

    @Test
    void anAdminHandsABoxToAnotherUser() throws Exception {
        UUID box = ownedBox(UUID.randomUUID());
        UUID next = UUID.randomUUID();

        mvc.perform(post("/api/v1/admin/mailboxes/{id}/reassign", box).with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content(owner(next)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ownerUserId").value(next.toString()));

        assertThat(mailboxes.findById(box).orElseThrow().getOwnerUserId()).isEqualTo(next);
    }

    @Test
    void anAdminDetachesABox() throws Exception {
        UUID box = ownedBox(UUID.randomUUID());

        mvc.perform(post("/api/v1/admin/mailboxes/{id}/detach", box).with(asAdmin()))
                .andExpect(status().isNoContent());

        assertThat(mailboxes.findById(box).orElseThrow().getOwnerUserId()).isNull();
    }

    @Test
    void aBoxInALiveTradeStaysWhereItIs() throws Exception {
        UUID owner = UUID.randomUUID();
        UUID box = ownedBox(owner);
        tradeUsing(TradeState.WAITING_EMAIL_CHANGE, box, null);

        mvc.perform(post("/api/v1/admin/mailboxes/{id}/detach", box).with(asAdmin()))
                .andExpect(status().isConflict());

        assertThat(mailboxes.findById(box).orElseThrow().getOwnerUserId()).isEqualTo(owner);
    }

    /** In a swap the buyer's box is only on the side row — the guard has to look there too. */
    @Test
    void theBuyersBoxInALiveSwapIsGuardedToo() throws Exception {
        UUID buyerBox = ownedBox(UUID.randomUUID());
        tradeUsing(TradeState.VERIFYING_KONAMI_LINK, ownedBox(UUID.randomUUID()), buyerBox);

        mvc.perform(post("/api/v1/admin/mailboxes/{id}/reassign", buyerBox).with(asAdmin())
                        .contentType(MediaType.APPLICATION_JSON).content(owner(UUID.randomUUID())))
                .andExpect(status().isConflict());
    }

    @Test
    void aFinishedTradeNoLongerHoldsTheBox() throws Exception {
        UUID box = ownedBox(UUID.randomUUID());
        tradeUsing(TradeState.SUCCESS, box, null);

        mvc.perform(post("/api/v1/admin/mailboxes/{id}/detach", box).with(asAdmin()))
                .andExpect(status().isNoContent());
    }

    @Test
    void aPlainUserCannotMoveMailboxes() throws Exception {
        UUID box = ownedBox(UUID.randomUUID());

        mvc.perform(post("/api/v1/admin/mailboxes/{id}/detach", box).with(asUser(UUID.randomUUID())))
                .andExpect(status().isForbidden());
    }
}
