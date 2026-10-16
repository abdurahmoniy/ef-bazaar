package uz.efbazaar.trade.mailbox.domain;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.util.Objects;
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

    @Column(name = "display_name", length = 60)
    private String displayName;

    /** A mailbox name belongs to its current owner and must not follow a handoff. */
    public void setOwnerUserId(UUID ownerUserId) {
        if (!Objects.equals(this.ownerUserId, ownerUserId)) {
            this.displayName = null;
            this.ownerMailVisibleFrom = Instant.now();
        }
        this.ownerUserId = ownerUserId;
    }

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

    /** Earliest IMAP arrival visible to the current owner; independent of password rotation. */
    @Column(name = "owner_mail_visible_from")
    private Instant ownerMailVisibleFrom;

    @Column(name = "handed_off_at")
    private Instant handedOffAt;

    /**
     * Order within the owner's plan limit: the top N by this stay readable.
     * Defaults to creation time (newest open); a user swap exchanges two values.
     */
    @Column(name = "access_priority", nullable = false)
    @Builder.Default
    private long accessPriority = System.currentTimeMillis();

    @Column(name = "deleted_at")
    private Instant deletedAt;

    /** How the row was born — see {@link MailboxSource}. */
    @Enumerated(EnumType.STRING)
    @Column(name = "source", nullable = false, length = 16)
    @Builder.Default
    private MailboxSource source = MailboxSource.TRADE;

    /** Admin who registered the mailbox from the panel; null for TRADE rows. */
    @Column(name = "created_by_admin_id")
    private UUID createdByAdminId;

    /** Which allowance the box spends — see {@link MailboxKind}. */
    @Enumerated(EnumType.STRING)
    @Column(name = "kind", nullable = false, length = 16)
    @Builder.Default
    private MailboxKind kind = MailboxKind.RANDOM;

    /** Marketplace account this box is verified for; null = free. */
    @Column(name = "linked_account_id")
    private UUID linkedAccountId;

    /** Set when the worker confirms Mailcow created the box. Null = still pending. */
    @Column(name = "provisioned_at")
    private Instant provisionedAt;
}
