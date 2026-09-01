package uz.efbazaar.marketplace.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "chats")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Chat {

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "listing_id", nullable = false)
    private UUID listingId;

    @Column(name = "buyer_id", nullable = false)
    private UUID buyerId;

    @Column(name = "seller_id", nullable = false)
    private UUID sellerId;

    @Column(name = "is_important", nullable = false)
    @Builder.Default
    private boolean important = false;

    @Column(name = "last_message_at", nullable = false)
    private Instant lastMessageAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /**
     * Display-name snapshot resolved from auth-service at chat creation.
     * Nullable so chats created before this column was added still deserialise;
     * the frontend falls back to a role label ("Xaridor" / "Sotuvchi") when null.
     */
    @Column(name = "buyer_display_name", length = 64)
    private String buyerDisplayName;

    @Column(name = "seller_display_name", length = 64)
    private String sellerDisplayName;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        createdAt = now;
        if (lastMessageAt == null) lastMessageAt = now;
    }

    public boolean isParticipant(UUID userId) {
        return userId != null && (userId.equals(buyerId) || userId.equals(sellerId));
    }

    /**
     * The other person in the conversation.
     *
     * <p>Named "partner", not "seller": {@code buyerId} / {@code sellerId}
     * record who opened the chat about which listing, and stop describing the
     * roles once the pair trades again — possibly the other way round. Trading
     * roles come from the chat's account request, not from these columns.
     */
    public UUID partnerOf(UUID userId) {
        if (!isParticipant(userId)) return null;
        return userId.equals(buyerId) ? sellerId : buyerId;
    }

    public String displayNameOf(UUID userId) {
        if (!isParticipant(userId)) return null;
        return userId.equals(buyerId) ? buyerDisplayName : sellerDisplayName;
    }
}
