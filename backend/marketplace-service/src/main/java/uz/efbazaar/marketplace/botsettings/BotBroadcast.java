package uz.efbazaar.marketplace.botsettings;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Bot orqali barcha foydalanuvchilarga yuborilgan ommaviy xabar.
 *
 * <p>Qator jo'natish holatini ham, tarixni ham saqlaydi — tarix aslida
 * yakunlangan jo'natishning o'zi. Xabar matni yuborilgandan keyin ham
 * shu yerda qoladi: tarixda aynan nima ketgani ko'rinishi kerak.
 */
@Entity
@Table(name = "bot_broadcasts")
@Getter
@Setter
@NoArgsConstructor
public class BotBroadcast {

    public enum Status {
        /** Yaratildi, bot hali boshlamadi. */
        QUEUED,
        /** Bot yuborayapti. */
        SENDING,
        /** Ro'yxat oxirigacha yetdi (ba'zilari yetmagan bo'lishi mumkin). */
        SENT,
        /** Jo'natish uzildi — bot yiqildi yoki ro'yxatni ololmadi. */
        FAILED;

        public boolean isActive() {
            return this == QUEUED || this == SENDING;
        }
    }

    @Id
    @GeneratedValue
    @Column(columnDefinition = "uuid", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "message_text", nullable = false, columnDefinition = "text")
    private String messageText;

    @Column(name = "banner_file_id", columnDefinition = "text")
    private String bannerFileId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "buttons", nullable = false, columnDefinition = "jsonb")
    private List<List<InlineButton>> buttons = new ArrayList<>();

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Status status = Status.QUEUED;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Audience audience = Audience.ALL;

    /**
     * {@link Audience#SELECTED} uchun tanlangan Telegram chat id lari.
     *
     * <p>Boshqa auditoriyalarda bo'sh — ular uchun ro'yxat jo'natish paytida
     * auth-service'dan olinadi. SELECTED da esa ro'yxat shu yerda saqlanishi
     * shart: keyinchalik "bu xabar kimga ketgan" degan savolga javob
     * beradigan boshqa joy yo'q.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "recipient_telegram_ids", nullable = false, columnDefinition = "jsonb")
    private List<Long> recipientTelegramIds = new ArrayList<>();

    @Column(name = "total_recipients", nullable = false)
    private int totalRecipients;

    /**
     * Uch xil natija ataylab alohida sanaladi.
     *
     * <p>{@code blocked} — foydalanuvchi botni bloklagan yoki hech qachon
     * /start bosmagan. Bu KUTILGAN holat va har jo'natishda uchraydi.
     * {@code failed} esa kutilmagan xatolik va tekshirishni talab qiladi.
     * Ikkalasini bitta songa qo'shsak, nosozlik normal fonda ko'rinmay
     * qolardi.
     */
    @Column(name = "sent_count", nullable = false)
    private int sentCount;

    @Column(name = "failed_count", nullable = false)
    private int failedCount;

    @Column(name = "blocked_count", nullable = false)
    private int blockedCount;

    @Column(name = "created_by", columnDefinition = "uuid")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "error_message", columnDefinition = "text")
    private String errorMessage;

    /**
     * Xabar kimga ketadi.
     *
     * <p>{@link #ADMINS} — sinov rejimi: xabar bir necha kishiga boradi va
     * xato bo'lsa arzon tuzatiladi. {@link #ALL} bilan yuborilgan xatoni
     * qaytarib bo'lmaydi, shuning uchun sinov rejimi alohida turadi.
     *
     * <p>{@link #SELECTED} — admin qo'lda tanlagan foydalanuvchilar
     * (ogohlantirish va shunga o'xshash maxsus xabarlar uchun).
     */
    public enum Audience { ALL, USERS, ADMINS, SELECTED }

    /** Telegram inline tugmasi — matn va havola. */
    public record InlineButton(String text, String url) {}
}
