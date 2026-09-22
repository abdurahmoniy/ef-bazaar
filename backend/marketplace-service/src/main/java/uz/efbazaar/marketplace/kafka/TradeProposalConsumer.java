package uz.efbazaar.marketplace.kafka;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.ChatMessage;
import uz.efbazaar.marketplace.domain.ChatMessageType;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ProposalMessageResolutionRepository;
import uz.efbazaar.marketplace.domain.ProposalMessageResolution;

import java.time.Instant;

/**
 * Renders trade-service proposals as system messages in the marketplace chat.
 *
 * <p>On {@code proposal-created} — insert a TRADE_PROPOSAL row (idempotent by
 * proposal_id via a lookup). On {@code proposal-resolved} — patch the outcome.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class TradeProposalConsumer {

    private final ChatMessageRepository messages;
    private final ProposalMessageResolutionRepository resolutions;

    private ProposalMessageResolution lockResolution(java.util.UUID proposalId) {
        resolutions.ensureExists(proposalId);
        return resolutions.lockByProposalId(proposalId);
    }

    @KafkaListener(
            topics = "efbazaar.trade.proposal-created",
            groupId = "marketplace-trade-proposal",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeProposalCreatedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onCreated(TradeProposalCreatedDto e) {
        ProposalMessageResolution resolution = lockResolution(e.proposalId());
        if (messages.existsByProposalId(e.proposalId())) {
            log.debug("proposal-created replay for {}, skipping", e.proposalId());
            return;
        }
        ChatMessage msg = ChatMessage.builder()
                .chatId(e.marketplaceChatId())
                .senderId(e.proposerUserId())
                .content(String.valueOf(e.amountUzs()))
                .messageType(ChatMessageType.TRADE_PROPOSAL)
                .proposalId(e.proposalId())
                .proposalOutcome(resolution.getOutcome() != null ? resolution.getOutcome() : "PENDING")
                .proposalTradeId(resolution.getTradeId())
                .proposalKind(e.kind())
                .proposalListingId(e.listingId())
                .proposalExpiresAt(e.expiresAt())
                .createdAt(e.createdAt() != null ? e.createdAt() : Instant.now())
                .build();
        messages.save(msg);
        log.info("Inserted TRADE_PROPOSAL message for proposal={} chat={}",
                e.proposalId(), e.marketplaceChatId());
    }

    @KafkaListener(
            topics = "efbazaar.trade.proposal-resolved",
            groupId = "marketplace-trade-proposal",
            properties = {
                    "spring.json.value.default.type=uz.efbazaar.marketplace.kafka.TradeProposalResolvedDto",
                    "spring.json.use.type.headers=false"
            }
    )
    @Transactional
    public void onResolved(TradeProposalResolvedDto e) {
        ProposalMessageResolution resolution = lockResolution(e.proposalId());
        resolution.setOutcome(e.outcome());
        if (e.tradeId() != null) resolution.setTradeId(e.tradeId());
        resolutions.save(resolution);
        // If creation has not arrived, its listener will read the saved result.
        messages.updateProposalOutcome(e.proposalId(), e.outcome(), resolution.getTradeId());
    }
}
