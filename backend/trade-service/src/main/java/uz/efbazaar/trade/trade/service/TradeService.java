package uz.efbazaar.trade.trade.service;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import uz.efbazaar.trade.trade.dto.TradeResponse;

import java.util.UUID;

@Service
@RequiredArgsConstructor
public class TradeService {

    /**
     * Fleshed out in Task 11. Signature is fixed now so TradeProposalService
     * can be compiled independently.
     */
    public TradeResponse openTrade(UUID sellerId, UUID buyerId, long priceUzs,
                                   UUID sellerCardId, UUID buyerCardId, UUID listingId) {
        throw new UnsupportedOperationException("Task 11 — see plan");
    }
}
