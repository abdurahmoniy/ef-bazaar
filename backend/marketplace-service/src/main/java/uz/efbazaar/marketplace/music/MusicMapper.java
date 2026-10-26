package uz.efbazaar.marketplace.music;

import org.mapstruct.Mapper;
import uz.efbazaar.marketplace.music.MusicDtos.TrackResponse;

@Mapper(componentModel = "spring")
public interface MusicMapper {
    TrackResponse toResponse(MusicTrack track);
}
