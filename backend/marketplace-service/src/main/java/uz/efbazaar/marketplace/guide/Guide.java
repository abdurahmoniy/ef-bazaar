package uz.efbazaar.marketplace.guide;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/** Bitta video qo'llanma. Video Telegram'da, bizda faqat `file_id`. */
@Entity
@Table(name = "guide")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Guide {

    @Id
    private UUID id;

    @Column(nullable = false)
    private String title;

    @Column(nullable = false)
    private String description;

    @Column(name = "video_file_id", nullable = false)
    private String videoFileId;

    /**
     * VIDEO yoki DOCUMENT — Telegram faylni qanday qabul qilgani.
     *
     * <p>Qayta yuborish usuli shunga bog'liq: document'ning `file_id` sini
     * `sendVideo` ga bersak Telegram rad etadi va qo'llanma kelmaydi.
     */
    @Column(name = "media_kind", nullable = false)
    private String mediaKind;

    @Column(name = "created_by")
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
}
