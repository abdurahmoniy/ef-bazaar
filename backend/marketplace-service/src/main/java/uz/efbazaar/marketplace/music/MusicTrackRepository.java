package uz.efbazaar.marketplace.music;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface MusicTrackRepository extends JpaRepository<MusicTrack, UUID> {
    List<MusicTrack> findAllByOrderBySortOrderAscCreatedAtAscIdAsc();
    List<MusicTrack> findAllByEnabledTrueOrderBySortOrderAscCreatedAtAscIdAsc();
}
