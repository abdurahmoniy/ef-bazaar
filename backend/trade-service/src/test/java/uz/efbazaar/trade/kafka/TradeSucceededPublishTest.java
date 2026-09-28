package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import uz.efbazaar.trade.trade.domain.Trade;
import uz.efbazaar.trade.trade.domain.TradeMode;

import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentCaptor.forClass;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TradeSucceededPublishTest {

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.EnumSource(uz.efbazaar.trade.trade.domain.TradeKind.class)
    @DisplayName("the event carries both parties and the mode")
    void publishesBothParties(uz.efbazaar.trade.trade.domain.TradeKind kind) {
        @SuppressWarnings("unchecked")
        KafkaTemplate<String, Object> kafka = mock(KafkaTemplate.class);
        // doSend chains whenComplete on the returned future, so a bare mock
        // (null) would NPE before anything is captured.
        CompletableFuture<SendResult<String, Object>> sent =
                CompletableFuture.completedFuture(null);
        when(kafka.send(anyString(), anyString(), any())).thenReturn(sent);

        TradeEventPublisher publisher = new TradeEventPublisher(kafka);

        Trade trade = new Trade();
        trade.setId(UUID.randomUUID());
        trade.setBuyerId(UUID.randomUUID());
        trade.setSellerId(UUID.randomUUID());
        trade.setMode(TradeMode.SMART);
        trade.setKind(kind);
        UUID given = kind.isSwap() ? UUID.randomUUID() : null;
        trade.setGiveAccountId(given);

        publisher.tradeSucceeded(trade);

        var topic = forClass(String.class);
        var key = forClass(String.class);
        var payload = forClass(Object.class);
        verify(kafka).send(topic.capture(), key.capture(), payload.capture());

        assertThat(topic.getValue()).isEqualTo("efbazaar.trade.trade-succeeded");
        assertThat(key.getValue()).isEqualTo(trade.getId().toString());
        assertThat(payload.getValue())
                .isInstanceOf(TradeEvents.TradeSucceeded.class)
                .satisfies(p -> {
                    var e = (TradeEvents.TradeSucceeded) p;
                    assertThat(e.tradeId()).isEqualTo(trade.getId());
                    assertThat(e.buyerId()).isEqualTo(trade.getBuyerId());
                    assertThat(e.sellerId()).isEqualTo(trade.getSellerId());
                    assertThat(e.mode()).isEqualTo("SMART");
                    assertThat(e.kind()).isEqualTo(kind.name());
                    // marketplace shu orqali xaridor bergan akkountni sotuvchiga ko'chiradi.
                    assertThat(e.giveAccountId()).isEqualTo(given);
                    assertThat(e.occurredAt()).isNotNull();
                });
    }
}
