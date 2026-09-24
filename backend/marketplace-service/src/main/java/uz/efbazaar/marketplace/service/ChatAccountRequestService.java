package uz.efbazaar.marketplace.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.marketplace.domain.AccountRequestStatus;
import uz.efbazaar.marketplace.domain.Chat;
import uz.efbazaar.marketplace.domain.ChatMessage;
import uz.efbazaar.marketplace.domain.ChatMessageType;
import uz.efbazaar.marketplace.domain.ChatAccountRequest;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.AccountRequestResponse;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ChatAccountRequestRepository;
import uz.efbazaar.marketplace.repository.ChatParticipantRepository;
import uz.efbazaar.marketplace.repository.ChatRepository;
import uz.efbazaar.marketplace.repository.ChatMessageRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.time.Duration;
import java.time.Instant;
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

    private static final Duration CONTACT_RETRY_WINDOW = Duration.ofSeconds(30);

    private final ChatAccountRequestRepository requests;
    private final ChatMessageRepository messages;
    private final ChatRepository chats;
    private final ListingRepository listings;
    private final ChatParticipantRepository participants;
    private final MarketplaceEventPublisher events;
    private final NotificationService notifications;

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

        Instant openedAt = Instant.now();
        Optional<ChatAccountRequest> previous =
                requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN);
        if (previous.isPresent()) {
            ChatAccountRequest prev = previous.get();
            if (prev.getListingId().equals(listingId)
                    && prev.getRequesterId().equals(requesterId)
                    && prev.getCreatedAt() != null
                    && (chat.getClearedAt() == null || prev.getCreatedAt().isAfter(chat.getClearedAt()))
                    && prev.getCreatedAt().plus(CONTACT_RETRY_WINDOW).isAfter(openedAt)
                    && !hasEndedProposal(prev, openedAt)) {
                return prev;   // deduplicate quick retries, not every future contact
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
                .createdAt(openedAt)
                .build());

        String title = listing.getDescription() == null ? "" : listing.getDescription().lines()
                .map(String::trim).filter(line -> !line.isEmpty()).findFirst().orElse("");
        if (title.length() > 160) title = title.substring(0, 157) + "…";
        messages.save(ChatMessage.builder()
                .chatId(chatId)
                .senderId(requesterId)
                .messageType(ChatMessageType.TEXT)
                .content("Akkount bo‘yicha so‘rov yuborildi." + (title.isEmpty() ? "" : "\nE’lon: " + title))
                .createdAt(openedAt)
                .build());

        chat.setListingId(listingId);
        chat.setLastMessageAt(openedAt);
        chats.save(chat);

        UUID partnerId = chat.partnerOf(requesterId);
        participants.findByChatIdAndUserId(chatId, requesterId)
                .filter(p -> p.getHiddenAt() != null)
                .ifPresent(p -> p.setHiddenAt(null));
        participants.findByChatIdAndUserId(chatId, partnerId)
                .filter(p -> p.getHiddenAt() != null)
                .ifPresent(p -> p.setHiddenAt(null));

        events.chatCreated(chat.getId(), listingId, requesterId, partnerId);
        notifications.accountRequested(partnerId, chat.getId(), listingId, chat.displayNameOf(requesterId));

        log.info("Account request opened: chat={} requester={} listing={}",
                chatId, requesterId, listingId);
        return req;
    }

    /**
     * Rejections/expiry resolve the trade message, but legacy contact rows stay OPEN.
     * Renew only for the latest proposal in this request, not an older negotiation.
     */
    private boolean hasEndedProposal(ChatAccountRequest request, Instant now) {
        if (request.getCreatedAt() == null) return false;
        return messages.findFirstByChatIdAndMessageTypeOrderByCreatedAtDescIdDesc(
                        request.getChatId(), ChatMessageType.TRADE_PROPOSAL)
                .filter(message -> request.getListingId().equals(message.getProposalListingId()))
                .filter(message -> message.getCreatedAt() != null
                        && !message.getCreatedAt().isBefore(request.getCreatedAt()))
                .filter(message -> "REJECTED".equals(message.getProposalOutcome())
                        || "EXPIRED".equals(message.getProposalOutcome())
                        // The deadline can pass before the resolution event arrives.
                        || ((message.getProposalOutcome() == null || "PENDING".equals(message.getProposalOutcome()))
                            && message.getProposalTradeId() == null
                            && message.getProposalExpiresAt() != null
                            && !message.getProposalExpiresAt().isAfter(now)))
                .isPresent();
    }

    @Transactional(readOnly = true)
    public Optional<ChatAccountRequest> current(UUID viewerId, UUID chatId) {
        Chat chat = chats.findById(chatId).orElseThrow(MarketplaceException::chatNotFound);
        if (!chat.isParticipant(viewerId)) {
            throw MarketplaceException.notChatParticipant();
        }
        return requests.findByChatIdAndStatus(chatId, AccountRequestStatus.OPEN)
                .filter(request -> chat.getClearedAt() == null
                        || (request.getCreatedAt() != null && request.getCreatedAt().isAfter(chat.getClearedAt())));
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
