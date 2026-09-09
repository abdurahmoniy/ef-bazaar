package uz.efbazaar.marketplace.emoji;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "emoji_pack")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmojiPack {

    @Id
    private UUID id;

    @Column(name = "set_name", nullable = false, unique = true)
    private String setName;

    @Column(nullable = false)
    private String title;

    @Column(name = "added_by")
    private UUID addedBy;

    @Column(name = "added_at", nullable = false)
    private Instant addedAt;

    @Column(name = "refreshed_at")
    private Instant refreshedAt;

    /**
     * Orphan removal bilan: qayta import qilinganda eski ro'yxat butunlay
     * almashtiriladi. To'plamdan emoji o'chirilgan bo'lsa, bizda ham qolmasin
     * — u id endi Telegram'da yaroqsiz va matnga qo'yilsa xato beradi.
     */
    @OneToMany(mappedBy = "pack", cascade = CascadeType.ALL, orphanRemoval = true,
            fetch = FetchType.LAZY)
    @OrderBy("sortOrder ASC")
    @Builder.Default
    private List<EmojiPackItem> items = new ArrayList<>();
}
