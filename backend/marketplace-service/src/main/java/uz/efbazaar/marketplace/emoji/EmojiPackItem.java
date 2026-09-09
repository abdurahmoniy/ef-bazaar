package uz.efbazaar.marketplace.emoji;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

@Entity
@Table(name = "emoji_pack_item")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class EmojiPackItem {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pack_id", nullable = false)
    private EmojiPack pack;

    @Column(name = "custom_emoji_id", nullable = false)
    private String customEmojiId;

    @Column(nullable = false)
    private String emoji;

    @Column(name = "file_id", nullable = false)
    private String fileId;

    @Column(name = "thumbnail_file_id", nullable = false)
    private String thumbnailFileId;

    @Column(nullable = false)
    private String format;

    @Column(name = "sort_order", nullable = false)
    private int sortOrder;
}
