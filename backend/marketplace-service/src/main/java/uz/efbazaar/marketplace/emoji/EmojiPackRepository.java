package uz.efbazaar.marketplace.emoji;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface EmojiPackRepository extends JpaRepository<EmojiPack, UUID> {

    Optional<EmojiPack> findBySetName(String setName);

    java.util.List<EmojiPack> findAllByOrderByAddedAtAsc();
}
