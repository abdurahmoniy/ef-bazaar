package uz.efbazaar.bot.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class VideoProxyControllerTest {

    private final TelegramApiClient telegram = mock(TelegramApiClient.class);
    private final VideoProxyController controller = new VideoProxyController(telegram);

    private MockMvc videoServer() {
        when(telegram.getFilePath("v-range")).thenReturn(Optional.of("videos/guide.mp4"));
        when(telegram.downloadFile("videos/guide.mp4"))
                .thenReturn(Optional.of(new byte[]{1, 2, 3, 4, 5, 6}));
        return MockMvcBuilders.standaloneSetup(controller).build();
    }

    @Test
    void browserProbeReturnsOnlyRequestedBytes() throws Exception {
        videoServer().perform(get("/bot/video/v-range").header("Range", "bytes=0-1"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 0-1/6"))
                .andExpect(header().string("Content-Length", "2"))
                .andExpect(content().bytes(new byte[]{1, 2}));
    }

    @Test
    void browserCanReadMetadataAtEndOfVideo() throws Exception {
        videoServer().perform(get("/bot/video/v-range").header("Range", "bytes=-2"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 4-5/6"))
                .andExpect(content().bytes(new byte[]{5, 6}));
    }

    @Test
    void browserCanSeekWithOpenEndedRange() throws Exception {
        videoServer().perform(get("/bot/video/v-range").header("Range", "bytes=3-"))
                .andExpect(status().isPartialContent())
                .andExpect(header().string("Content-Range", "bytes 3-5/6"))
                .andExpect(content().bytes(new byte[]{4, 5, 6}));
    }

    @Test
    void unsatisfiableRangeReportsVideoLength() throws Exception {
        videoServer().perform(get("/bot/video/v-range").header("Range", "bytes=9-"))
                .andExpect(status().isRequestedRangeNotSatisfiable())
                .andExpect(header().string("Content-Range", "bytes */6"));
    }

    @Test
    @DisplayName("video formatlari to'g'ri aniqlanadi")
    void contentTypesDetectedCorrectly() {
        assertThat(VideoProxyController.guessContentType("videos/guide.mp4")).hasToString("video/mp4");
        assertThat(VideoProxyController.guessContentType("videos/guide.webm")).hasToString("video/webm");
        assertThat(VideoProxyController.guessContentType("videos/guide.ogg")).hasToString("video/ogg");
        assertThat(VideoProxyController.guessContentType("videos/unknown")).hasToString("video/mp4");
    }

    @Test
    @DisplayName("mavjud video inline ijro uchun beriladi")
    void servesVideoInline() {
        when(telegram.getFilePath("v-123")).thenReturn(Optional.of("videos/guide.mp4"));
        when(telegram.downloadFile("videos/guide.mp4")).thenReturn(Optional.of(new byte[]{1, 2, 3, 4}));

        ResponseEntity<ByteArrayResource> response = controller.video("v-123");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).hasToString("video/mp4");
        assertThat(response.getHeaders().getFirst("Content-Disposition")).isEqualTo("inline");
        assertThat(response.getHeaders().getFirst("Accept-Ranges")).isEqualTo("bytes");
        assertThat(response.getBody().getByteArray()).containsExactly(1, 2, 3, 4);
    }

    @Test
    @DisplayName("fayl topilmasa 404 beradi")
    void fileNotFoundReturns404() {
        when(telegram.getFilePath("v-999")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.video("v-999"))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.NOT_FOUND);
    }

    @Test
    @DisplayName("yuklab olish muvaffaqiyatsiz bo'lsa 502 beradi")
    void downloadFailedReturns502() {
        when(telegram.getFilePath("v-error")).thenReturn(Optional.of("videos/corrupt.mp4"));
        when(telegram.downloadFile("videos/corrupt.mp4")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> controller.video("v-error"))
                .isInstanceOf(ResponseStatusException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.BAD_GATEWAY);
    }
}
