package uz.efbazaar.trade.trade.dto;

import java.time.Instant;
import java.util.UUID;
import uz.efbazaar.trade.trade.domain.AdminFeePayer;

public record ProposalResponse(UUID proposalId, Instant expiresAt,
        AdminFeePayer adminFeePayer, Long adminFeeTiyin, Long buyerHoldTiyin, Long sellerHoldTiyin
) {
    public ProposalResponse(UUID proposalId, Instant expiresAt) {
        this(proposalId, expiresAt, AdminFeePayer.SELLER, null, null, null);
    }
}
