package uz.efbazaar.trade.trade;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeState;
import uz.efbazaar.trade.trade.service.TradeService;
import uz.efbazaar.trade.trade.service.TradeSideService;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class TradeResponseActivityTest {
    @Test
    void exposesLastTradeUpdateSoContactsDuringATradeDoNotStartAnotherNegotiation() {
        TradeService service = mock(TradeService.class, CALLS_REAL_METHODS);
        ReflectionTestUtils.setField(service, "sideService", mock(TradeSideService.class));
        Instant created = Instant.parse("2026-09-20T10:00:00Z");
        Instant finished = Instant.parse("2026-09-21T10:00:00Z");
        Trade trade = Trade.builder().id(UUID.randomUUID()).state(TradeState.SUCCESS)
                .createdAt(created).updatedAt(finished).build();
        ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
        var response = mapper.valueToTree(service.toResponse(trade, null));
        assertThat(response.hasNonNull("updatedAt")).isTrue();
        assertThat(mapper.convertValue(response.get("updatedAt"), Instant.class)).isEqualTo(finished);
    }
}
