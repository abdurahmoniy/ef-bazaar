package uz.efbazaar.recommendation.feed;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Sessiya snapshot'i: bitta profil hash'i uchun tartiblangan ID'lar. */
public interface FeedCache {

    Optional<List<UUID>> get(UUID userId, String profileHash);

    void put(UUID userId, String profileHash, List<UUID> ids);
}
