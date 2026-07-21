package uz.efbazaar.marketplace.trust;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

import java.util.Locale;
import java.util.UUID;

/**
 * External identity attached to a blocking penalty — catches the same person
 * re-registering with a fresh account. Values are stored normalized; always
 * go through {@link #normalize} before insert or lookup.
 */
@Entity
@Table(name = "blacklist_identifiers")
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BlacklistIdentifier {

    public enum Type { KONAMI_ID, TELEGRAM_ID, TELEGRAM_USERNAME, PHONE }

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "penalty_id", nullable = false)
    private UUID penaltyId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private Type type;

    @Column(nullable = false, length = 128)
    private String value;

    /** Lowercase, no leading '@'; phone/telegram-id keep digits only. */
    public static String normalize(Type type, String raw) {
        if (raw == null) return null;
        String v = raw.trim().toLowerCase(Locale.ROOT);
        if (v.startsWith("@")) v = v.substring(1);
        if (type == Type.PHONE || type == Type.TELEGRAM_ID) {
            v = v.replaceAll("\\D", "");
        }
        return v;
    }
}
