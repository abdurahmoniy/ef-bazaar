package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.AccountRequestStatus;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatAccountRequest;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.AccountRequestResponse;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatAccountRequestRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Picks which account a chat is currently about.
 *
 * <p>Both parties may open a request. Whoever does becomes the buyer for the
 * trade that follows, so the same pair can trade in either direction without a
 * second chat — which is the whole point: one conversation per pair, an
 * explicit listing per trade.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatAccountRequestService {

    private final ChatAccountRequestRepository requests;
    private final ChatRepository chats;
    private final ListingRepository listings;

    /**
     * Opens a request, superseding any earlier one in the same chat.
     *
     * <p>Superseding rather than refusing: the partial unique index allows one
     * OPEN row per chat, and a user who picked the wrong account should be able
     * to correct it by picking again, not by hunting for a cancel button.
     */
    @Transactional
    public ChatAccountRequest open(UUID requesterId, UUID chatId, UUID listingId) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(requesterId)) {
            throw MarketplaceException.notChatParticipant();
        }

        Listing listing = listings.findById(listingId)
                .orElseThrow(MarketplaceException::listingNotFound);
        if (listing.getSellerId().equals(requesterId)) {
            throw MarketplaceException.cannotRequestOwnListing();
        }
        // The picker only offers the partner's listings, so reaching this means
        // a hand-built request — reject rather than open a trade against a
        // third party's account.
        if (!listing.getSellerId().equals(chat.partnerOf(requesterId))) {
            throw MarketplaceException.listingNotPartners();
        }
        if (listing.getStatus() != ListingStatus.ACTIVE) {
            throw MarketplaceException.listingNotActive();
        }

        Optional<ChatAccountRequest> previous =
                requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN);
        if (previous.isPresent()) {
            ChatAccountRequest prev = previous.get();
            if (prev.getListingId().equals(listingId)
                    && prev.getRequesterId().equals(requesterId)) {
                return prev;   // same ask, e.g. a double click — idempotent
            }
            prev.close(AccountRequestStatus.CANCELLED);
            // saveAndFlush, not save: Hibernate flushes inserts before updates,
            // so a plain save would send the new row first and collide with
            // uk_car_open_per_chat while the old row is still OPEN.
            requests.saveAndFlush(prev);
        }

        ChatAccountRequest req = requests.save(ChatAccountRequest.builder()
                .chatId(chatId)
                .requesterId(requesterId)
                .listingId(listingId)
                .status(AccountRequestStatus.OPEN)
                .build());
        log.info("Account request opened: chat={} requester={} listing={}",
                chatId, requesterId, listingId);
        return req;
    }

    @Transactional(readOnly = true)
    public Optional<ChatAccountRequest> current(UUID viewerId, UUID chatId) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(viewerId)) {
            throw MarketplaceException.notChatParticipant();
        }
        return requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN);
    }

    /** Either party may withdraw — the seller declining is as valid as the buyer changing their mind. */
    @Transactional
    public void cancel(UUID viewerId, UUID chatId) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(viewerId)) {
            throw MarketplaceException.notChatParticipant();
        }
        ChatAccountRequest req = requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN)
                .orElseThrow(MarketplaceException::accountRequestNotFound);
        req.close(AccountRequestStatus.CANCELLED);
        requests.save(req);
    }

    /** Attaches the listing so a client can render the request without a second call. */
    @Transactional(readOnly = true)
    public AccountRequestResponse describe(ChatAccountRequest req) {
        return AccountRequestResponse.of(req, listings.findById(req.getListingId()).orElse(null));
    }

    /** The partner's sellable listings — the contents of the picker. */
    @Transactional(readOnly = true)
    public List<Listing> partnerListings(UUID viewerId, UUID chatId) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(viewerId)) {
            throw MarketplaceException.notChatParticipant();
        }
        return listings.findBySellerIdAndStatusOrderByCreatedAtDesc(
                chat.partnerOf(viewerId), ListingStatus.ACTIVE);
    }
}
