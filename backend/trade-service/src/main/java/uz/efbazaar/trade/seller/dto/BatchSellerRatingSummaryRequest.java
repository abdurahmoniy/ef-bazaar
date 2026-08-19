package uz.efbazaar.trade.seller.dto;

import java.util.List;
import java.util.UUID;

public record BatchSellerRatingSummaryRequest(
        List<UUID> sellerIds
) {}
