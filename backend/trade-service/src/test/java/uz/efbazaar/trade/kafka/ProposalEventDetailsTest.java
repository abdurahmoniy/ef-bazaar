package uz.efbazaar.trade.kafka;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.kafka.core.KafkaTemplate;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class ProposalEventDetailsTest {
    @SuppressWarnings("unchecked")
    private final KafkaTemplate<String, Object> kafka = mock(KafkaTemplate.class);
    private final TradeEventPublisher publisher = new TradeEventPublisher(kafka);

    @Test
    void creationCarriesTheImmutableOfferDetails() {
        when(kafka.send(anyString(), anyString(), any())).thenReturn(CompletableFuture.completedFuture(null));
        UUID proposal = UUID.randomUUID();
        UUID listing = UUID.randomUUID();
        Instant expires = Instant.parse("2026-09-22T00:10:00Z");
        publisher.proposalCreated(proposal, UUID.randomUUID(), UUID.randomUUID(),
                5000, "SWAP_SURCHARGE", listing, expires);
        var event = ArgumentCaptor.forClass(TradeEvents.ProposalCreated.class);
        verify(kafka).send(eq(TradeEvents.TOPIC_PROPOSAL_CREATED), eq(proposal.toString()), event.capture());
        assertThat(event.getValue().kind()).isEqualTo("SWAP_SURCHARGE");
        assertThat(event.getValue().listingId()).isEqualTo(listing);
        assertThat(event.getValue().expiresAt()).isEqualTo(expires);
    }

    @Test
    void acceptanceCarriesTheExactResultingTrade() {
        when(kafka.send(anyString(), anyString(), any())).thenReturn(CompletableFuture.completedFuture(null));
        UUID proposal = UUID.randomUUID();
        UUID trade = UUID.randomUUID();
        publisher.proposalResolved(proposal, TradeEvents.ProposalOutcome.ACCEPTED, trade);
        var event = ArgumentCaptor.forClass(TradeEvents.ProposalResolved.class);
        verify(kafka).send(eq(TradeEvents.TOPIC_PROPOSAL_RESOLVED), eq(proposal.toString()), event.capture());
        assertThat(event.getValue().tradeId()).isEqualTo(trade);
        assertThat(event.getValue().outcome()).isEqualTo(TradeEvents.ProposalOutcome.ACCEPTED);
    }
}
