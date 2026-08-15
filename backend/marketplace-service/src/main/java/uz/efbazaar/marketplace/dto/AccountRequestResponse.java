package uz.efbazaar.marketplace.dto;

import uz.efbazaar.marketplace.domain.AccountRequestStatus;
import uz.efbazaar.marketplace.domain.ChatAccountRequest;
import uz.efbazaar.marketplace.domain.Listing;

import java.time.Instant;
import java.util.UUID;

/**
 * Which account the chat is about, and therefore who is buying.
 *
 * <p>{@code requesterId} is the buyer and the other participant is the seller,
 * so this is the single source both clients read their trading role from —
 * {@code chats.buyer_id} / {@code seller_id} only say who opened the chat, and
 * go stale the moment the pair trades the other way round.
 */
public record AccountRequestResponse(
        UUID id,
        UUID chatId,
        UUID requesterId,
        UUID listingId,
        AccountRequestStatus status,
        Instant createdAt,
        /** Null when the listing was deleted after the request was opened. */
        ChatListingOptionResponse listing
) {
    public static AccountRequestResponse of(ChatAccountRequest req, Listing listing) {
        return new AccountRequestResponse(
                req.getId(), req.getChatId(), req.getRequesterId(), req.getListingId(),
                req.getStatus(), req.getCreatedAt(),
                listing == null ? null : ChatListingOptionResponse.of(listing));
    }
}
