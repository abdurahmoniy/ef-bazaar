package uz.efbazaar.marketplace.account;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.Instant;
import java.util.UUID;

/**
 * Egasini kutayotgan pochta manzili.
 *
 * <p>Pochta topshirilgani haqidagi hodisa savdo yakunlangani haqidagisidan
 * OLDIN kelishi mumkin — ular ikki xil topikda va tartib kafolati yo'q.
 * O'shanda manzilni tashlab yuborish xaridorni emailsiz qoldirardi, shuning
 * uchun u shu yerda kutib turadi.
 */
@Entity
@Table(name = "pending_account_emails")
@IdClass(PendingAccountEmail.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class PendingAccountEmail {

    @Id
    @Column(name = "trade_id", nullable = false)
    private UUID tradeId;

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(nullable = false)
    private String email;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @PrePersist
    void prePersist() {
        if (createdAt == null) createdAt = Instant.now();
    }

    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Key implements Serializable {
        private UUID tradeId;
        private UUID userId;

        @Override
        public boolean equals(Object other) {
            if (this == other) return true;
            if (!(other instanceof Key key)) return false;
            return java.util.Objects.equals(tradeId, key.tradeId)
                    && java.util.Objects.equals(userId, key.userId);
        }

        @Override
        public int hashCode() {
            return java.util.Objects.hash(tradeId, userId);
        }
    }
}
