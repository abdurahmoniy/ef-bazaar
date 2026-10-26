package uz.efbazaar.marketplace.music;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonToken;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.fasterxml.jackson.databind.deser.std.StdDeserializer;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.io.IOException;
import java.util.UUID;

public final class MusicDtos {
    private MusicDtos() {}

    public record SaveTrackRequest(
            @NotBlank @Size(max = 120) String title,
            @Size(max = 120) String artist,
            @NotBlank @Size(max = 2048) String youtubeUrl,
            @NotNull @Min(0) @Max(10000)
            @JsonDeserialize(using = StrictIntegerDeserializer.class) Integer sortOrder,
            @NotNull @JsonDeserialize(using = StrictBooleanDeserializer.class) Boolean enabled) {
        public SaveTrackRequest {
            title = title == null ? null : title.strip();
            artist = artist == null ? "" : artist.strip();
            youtubeUrl = youtubeUrl == null ? null : youtubeUrl.strip();
        }
    }

    public record TrackResponse(UUID id, String title, String artist, String youtubeVideoId,
                                int sortOrder, boolean enabled) {}

    /** Jackson's default scalar coercion otherwise silently truncates fractional order values. */
    public static final class StrictIntegerDeserializer extends StdDeserializer<Integer> {
        public StrictIntegerDeserializer() { super(Integer.class); }
        @Override
        public Integer deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) {
                return (Integer) context.handleUnexpectedToken(Integer.class, parser);
            }
            return parser.getIntValue();
        }
    }

    public static final class StrictBooleanDeserializer extends StdDeserializer<Boolean> {
        public StrictBooleanDeserializer() { super(Boolean.class); }
        @Override
        public Boolean deserialize(JsonParser parser, DeserializationContext context) throws IOException {
            if (!parser.hasToken(JsonToken.VALUE_TRUE) && !parser.hasToken(JsonToken.VALUE_FALSE)) {
                return (Boolean) context.handleUnexpectedToken(Boolean.class, parser);
            }
            return parser.getBooleanValue();
        }
    }
}
