package uz.efbazaar.marketplace.music;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.music.MusicDtos.SaveTrackRequest;
import uz.efbazaar.marketplace.music.MusicDtos.TrackResponse;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MusicService {
    private final MusicTrackRepository tracks;
    private final MusicMapper mapper;

    @Transactional(readOnly = true)
    public List<TrackResponse> listEnabled() {
        return tracks.findAllByEnabledTrueOrderBySortOrderAscCreatedAtAscIdAsc().stream()
                .map(mapper::toResponse).toList();
    }

    @Transactional(readOnly = true)
    public List<TrackResponse> listAll() {
        return tracks.findAllByOrderBySortOrderAscCreatedAtAscIdAsc().stream()
                .map(mapper::toResponse).toList();
    }

    @Transactional
    public TrackResponse create(SaveTrackRequest request) {
        MusicTrack track = new MusicTrack();
        track.setId(UUID.randomUUID());
        track.setCreatedAt(Instant.now());
        apply(track, request);
        return mapper.toResponse(tracks.save(track));
    }

    @Transactional
    public TrackResponse update(UUID id, SaveTrackRequest request) {
        MusicTrack track = find(id);
        apply(track, request);
        return mapper.toResponse(tracks.save(track));
    }

    @Transactional
    public void delete(UUID id) {
        tracks.delete(find(id));
    }

    private MusicTrack find(UUID id) {
        return tracks.findById(id).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Musiqa topilmadi"));
    }

    private void apply(MusicTrack track, SaveTrackRequest request) {
        String videoId = YoutubeVideoId.parse(request.youtubeUrl());
        track.setTitle(request.title());
        track.setArtist(request.artist());
        track.setYoutubeVideoId(videoId);
        track.setSortOrder(request.sortOrder());
        track.setEnabled(request.enabled());
    }
}
