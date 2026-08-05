package uz.efbazaar.trade.admin;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import uz.efbazaar.trade.testsupport.AbstractIntegrationIT;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.repository.TradeRepository;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static uz.efbazaar.trade.testsupport.AuthHeaderRequestPostProcessor.asUser;

/**
 * HTTP-level check for {@code TradeAdminWorkController}: the class carries
 * {@code @PreAuthorize("hasAuthority('ROLE_TRADE_ADMIN')")}, and the checklist
 * read endpoint overrides it with a method-level
 * {@code @PreAuthorize("isAuthenticated()")} so a party — who holds no
 * {@code ROLE_TRADE_ADMIN} authority — can still read their own checklist.
 * {@code TradeStepServiceIT} exercises {@code TradeStepService} directly and
 * never goes through Spring Security, so it cannot catch a regression here;
 * this test does.
 */
@SpringBootTest
@AutoConfigureMockMvc
class TradeStepControllerIT extends AbstractIntegrationIT {

    @Autowired MockMvc mvc;
    @Autowired TradeRepository trades;

    @Test
    void aPartyWithNoTradeAdminRoleCanReadTheChecklist() throws Exception {
        UUID seller = UUID.randomUUID(), buyer = UUID.randomUUID(), admin = UUID.randomUUID();
        Trade t = trades.save(Trade.builder()
                .id(UUID.randomUUID())
                .sellerId(seller)
                .buyerId(buyer)
                .priceUzs(80_000)
                .state(TradeState.IN_PROGRESS)
                .mailboxId(UUID.randomUUID())
                .mode(TradeMode.HUMAN)
                .assignedAdminId(admin)
                .adminFeeUzs(15_000L)
                .expiresAt(Instant.now().plus(Duration.ofDays(7)))
                .build());

        // asUser defaults to ROLE_USER only — no ROLE_TRADE_ADMIN — so a 200
        // here proves the method-level override actually works, not just
        // that the class-level restriction was never reached.
        mvc.perform(get("/api/v1/trades/" + t.getId() + "/steps")
                        .with(asUser(seller)))
                .andExpect(status().isOk());
    }
}
