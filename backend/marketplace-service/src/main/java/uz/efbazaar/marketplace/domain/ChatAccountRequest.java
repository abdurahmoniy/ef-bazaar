package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * "I want to buy this account" — the one place a chat says which listing it is
 * currently about.
 *
 * <p>A chat is born from a listing, but that stops being true the moment the
 * two carry on talking: a seller with several listings leaves the conversation
 * ambiguous about which account is being sold. This row removes the ambiguity
 * per trade, and carries the roles with it — {@code requesterId} is the buyer,
 * the other participant is the seller. Trades therefore do not read
 * {@code chats.buyer_id} / {@code chats.seller_id}, which lets the same pair
 * trade repeatedly in one chat, in either direction.
 */
@Entity
@Table(name = "chat_account_requests")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatAccountRequest {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "chat_id", nullable = false)
    private UUID chatId;

    /** The party asking to buy — becomes the trade's buyer. */
    @Column(name = "requester_id", nullable = false)
    private UUID requesterId;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private AccountRequestStatus status = AccountRequestStatus.OPEN;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "closed_at")
    private Instant closedAt;

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = Instant.now();
    }

    /** Keeps {@code chk_car_closed_at} satisfied — the two move together. */
    public void close(AccountRequestStatus terminal) {
        this.status = terminal;
        this.closedAt = Instant.now();
    }
}
