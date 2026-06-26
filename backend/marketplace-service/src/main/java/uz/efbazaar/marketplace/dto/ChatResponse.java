package uz.efbazaar.marketplace.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import uz.efbazaar.marketplace.domain.ChatStatus;

import java.time.Instant;
import java.util.UUID;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ChatResponse(
        UUID id,
        UUID listingId,
        UUID buyerId,
        UUID sellerId,
        ChatStatus status,
        boolean important,
        Instant lastMessageAt,
        Instant createdAt,
        Instant closedAt,
        long messageCount
) {}
