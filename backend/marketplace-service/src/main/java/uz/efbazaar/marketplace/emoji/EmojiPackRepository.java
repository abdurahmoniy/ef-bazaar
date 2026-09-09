package uz.efbazaar.marketplace.emoji;

import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface EmojiPackRepository extends JpaRepository<EmojiPack, UUID> {

    Optional<EmojiPack> findBySetName(String setName);

    /**
     * Ro'yxat uchun — emoji'larning O'ZI yuklanmaydi.
     *
     * <p>`size(p.items)` JPQL'da sanash so'roviga aylanadi. Ro'yxatni
     * entity bilan qaytarib, keyin `getItems().size()` desak, bitta sonni
     * bilish uchun 200 ta yozuv o'qilardi — har to'plam uchun.
     */
    @Query("""
            select p.id as id, p.setName as setName, p.title as title,
                   size(p.items) as itemCount,
                   p.addedAt as addedAt, p.refreshedAt as refreshedAt
              from EmojiPack p
             order by p.addedAt asc
            """)
    List<SummaryView> summaries();

    /** Bitta to'plam, emoji'lari bilan — bitta so'rovda. */
    @EntityGraph(attributePaths = "items")
    Optional<EmojiPack> findWithItemsById(UUID id);

    interface SummaryView {
        UUID getId();
        String getSetName();
        String getTitle();
        int getItemCount();
        Instant getAddedAt();
        Instant getRefreshedAt();
    }
}
