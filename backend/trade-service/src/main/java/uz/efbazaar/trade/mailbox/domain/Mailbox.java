package uz.efbazaar.trade.mailbox.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "mailboxes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Mailbox {

    /**
     * Application-assigned UUID; see the same rationale on Card.
     */
    @Id
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "owner_user_id")
    private UUID ownerUserId;

    @Column(name = "trade_id")
    private UUID tradeId;

    @Column(name = "encrypted_password", nullable = false)
    private byte[] encryptedPassword;

    @Column(name = "password_iv", nullable = false, length = 12)
    private byte[] passwordIv;

    @Column(name = "password_tag", nullable = false, length = 16)
    private byte[] passwordTag;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "handed_off_at")
    private Instant handedOffAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
