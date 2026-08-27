package uz.efbazaar.marketplace.botsettings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * Telegram botining /start xabari — bitta qatorli sozlama jadvali.
 *
 * <p>{@code id} har doim {@link #SINGLETON_ID}; DB'dagi CHECK boshqa qiymatni
 * qabul qilmaydi. Shuning uchun generator ham, sequence ham kerak emas.
 */
@Entity
@Table(name = "bot_settings")
@Getter
@Setter
@NoArgsConstructor
public class BotSettings {

    public static final short SINGLETON_ID = 1;

    @Id
    @Column(nullable = false, updatable = false)
    private Short id = SINGLETON_ID;

    @Column(name = "welcome_text", nullable = false, columnDefinition = "text")
    private String welcomeText;

    /** Telegram file_id, yoki NULL — banner qo'yilmagan. */
    @Column(name = "banner_file_id", columnDefinition = "text")
    private String bannerFileId;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by", columnDefinition = "uuid")
    private UUID updatedBy;
}
