package uz.efbazaar.marketplace.music;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.music.MusicDtos.TrackResponse;

import java.util.List;

@RestController
@RequestMapping(value = "/api/v1/music", produces = "application/json")
@RequiredArgsConstructor
public class MusicController {
    private final MusicService service;

    @GetMapping
    public List<TrackResponse> list() {
        return service.listEnabled();
    }
}
