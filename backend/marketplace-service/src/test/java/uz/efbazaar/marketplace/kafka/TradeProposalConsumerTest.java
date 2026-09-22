package uz.efbazaar.marketplace.kafka;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.BeforeEach;
import org.mockito.ArgumentCaptor;
import uz.efbazaar.marketplace.domain.ChatMessage;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ProposalMessageResolutionRepository;
import uz.efbazaar.marketplace.domain.ProposalMessageResolution;
import org.mapstruct.factory.Mappers;
import uz.efbazaar.marketplace.mapper.ChatMapper;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.*;

class TradeProposalConsumerTest {
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules()
            .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
    private final ChatMessageRepository messages = mock(ChatMessageRepository.class);
    private final ProposalMessageResolutionRepository resolutions = mock(ProposalMessageResolutionRepository.class);
    private final TradeProposalConsumer consumer = new TradeProposalConsumer(messages, resolutions);

    @BeforeEach
    void setUp() {
        var stored = new java.util.HashMap<UUID, ProposalMessageResolution>();
        when(resolutions.lockByProposalId(any())).thenAnswer(call -> stored.computeIfAbsent(call.getArgument(0), id -> {
            var resolution = new ProposalMessageResolution();
            resolution.setProposalId(id);
            return resolution;
        }));
    }

    @Test
    void storesTheProposalsOwnDetails() throws Exception {
        UUID listing = UUID.randomUUID();
        String payload = """
                {"proposalId":"%s","marketplaceChatId":"%s","proposerUserId":"%s",
                 "amountUzs":5000,"kind":"SWAP_SURCHARGE","listingId":"%s",
                 "createdAt":"2026-09-22T00:00:00Z","expiresAt":"2026-09-22T00:10:00Z"}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), listing);
        consumer.onCreated(json.readValue(payload, TradeProposalCreatedDto.class));
        var captor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(messages).save(captor.capture());
        var stored = json.valueToTree(captor.getValue());
        assertThat(stored.path("proposalKind").asText()).isEqualTo("SWAP_SURCHARGE");
        assertThat(stored.path("proposalListingId").asText()).isEqualTo(listing.toString());
        assertThat(stored.hasNonNull("proposalExpiresAt")).isTrue();
        var response = json.valueToTree(Mappers.getMapper(ChatMapper.class).toMessageResponse(captor.getValue()));
        assertThat(response.path("proposalKind").asText()).isEqualTo("SWAP_SURCHARGE");
        assertThat(response.path("proposalListingId").asText()).isEqualTo(listing.toString());
        assertThat(response.hasNonNull("proposalExpiresAt")).isTrue();
    }

    @Test
    void acceptsLegacyEventsWithoutInventingMetadata() throws Exception {
        String payload = """
                {"proposalId":"%s","marketplaceChatId":"%s","proposerUserId":"%s","amountUzs":0}
                """.formatted(UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID());
        consumer.onCreated(json.readValue(payload, TradeProposalCreatedDto.class));
        var captor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(messages).save(captor.capture());
        assertThat(captor.getValue().getContent()).isEqualTo("0");
        assertThat(json.valueToTree(captor.getValue()).hasNonNull("proposalKind")).isFalse();
    }

    @Test
    void resolutionStoresTheExactAcceptedTradeId() throws Exception {
        UUID proposal = UUID.randomUUID();
        UUID trade = UUID.randomUUID();
        String payload = """
                {"proposalId":"%s","outcome":"ACCEPTED","tradeId":"%s","resolvedAt":"2026-09-22T00:01:00Z"}
                """.formatted(proposal, trade);
        consumer.onResolved(json.readValue(payload, TradeProposalResolvedDto.class));
        verify(messages).updateProposalOutcome(proposal, "ACCEPTED", trade);
        ChatMessage message = ChatMessage.builder().proposalTradeId(trade).build();
        assertThat(Mappers.getMapper(ChatMapper.class).toMessageResponse(message).proposalTradeId()).isEqualTo(trade);
    }

    @Test
    void replayedCreationDoesNotOverwriteAnExistingOutcome() throws Exception {
        UUID proposal = UUID.randomUUID();
        when(messages.existsByProposalId(proposal)).thenReturn(true);
        consumer.onCreated(new TradeProposalCreatedDto(proposal, UUID.randomUUID(), UUID.randomUUID(),
                5000, null, "SALE", null, null));
        verify(messages, never()).save(any());
    }

    @Test
    void resolutionBeforeCreationIsAppliedWhenTheMessageArrives() {
        UUID proposal = UUID.randomUUID();
        UUID trade = UUID.randomUUID();
        consumer.onResolved(new TradeProposalResolvedDto(proposal, "ACCEPTED", null, trade));
        consumer.onCreated(new TradeProposalCreatedDto(proposal, UUID.randomUUID(), UUID.randomUUID(),
                5000, null, "SALE", null, null));
        var captor = ArgumentCaptor.forClass(ChatMessage.class);
        verify(messages).save(captor.capture());
        assertThat(captor.getValue().getProposalOutcome()).isEqualTo("ACCEPTED");
        assertThat(captor.getValue().getProposalTradeId()).isEqualTo(trade);
    }

    @Test
    void replayingALegacyResolutionDoesNotEraseAKnownTradeLink() {
        UUID proposal = UUID.randomUUID();
        UUID trade = UUID.randomUUID();
        consumer.onResolved(new TradeProposalResolvedDto(proposal, "ACCEPTED", null, trade));
        consumer.onResolved(new TradeProposalResolvedDto(proposal, "ACCEPTED", null, null));
        verify(messages, times(2)).updateProposalOutcome(proposal, "ACCEPTED", trade);
    }
}
