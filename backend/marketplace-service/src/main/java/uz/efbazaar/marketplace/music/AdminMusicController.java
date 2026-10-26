package uz.efbazaar.marketplace.music;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.music.MusicDtos.SaveTrackRequest;
import uz.efbazaar.marketplace.music.MusicDtos.TrackResponse;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping(value = "/api/v1/admin/music", produces = "application/json")
@RequiredArgsConstructor
public class AdminMusicController {
    private final MusicService service;

    @GetMapping
    public List<TrackResponse> list() { return service.listAll(); }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public TrackResponse create(@Valid @RequestBody SaveTrackRequest request) { return service.create(request); }

    @PutMapping("/{id}")
    public TrackResponse update(@PathVariable UUID id, @Valid @RequestBody SaveTrackRequest request) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@PathVariable UUID id) { service.delete(id); }
}
