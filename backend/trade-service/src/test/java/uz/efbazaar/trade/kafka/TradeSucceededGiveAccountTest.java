package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TradeSucceededGiveAccountTest {

    @Test
    void theEventCarriesTheGivenAccount() throws Exception {
        UUID account = UUID.randomUUID();
        var event = new TradeEvents.TradeSucceeded(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(),
                UUID.randomUUID(), "SMART", "SWAP", account, Instant.now());

        String json = new com.fasterxml.jackson.databind.ObjectMapper()
                .findAndRegisterModules().writeValueAsString(event);

        assertThat(json).contains("\"giveAccountId\":\"" + account + "\"");
    }
}
