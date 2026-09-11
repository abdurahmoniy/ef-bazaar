package uz.efbazaar.bot.api;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.bot.telegram.TelegramApiClient;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class VideoProxyControllerTest {

    private final TelegramApiClient telegram = mock(TelegramApiClient.class);
    private final VideoProxyController controller = new VideoProxyController(telegram);

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

        ResponseEntity<byte[]> response = controller.video("v-123");

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getHeaders().getContentType()).hasToString("video/mp4");
        assertThat(response.getHeaders().getFirst("Content-Disposition")).isEqualTo("inline");
        assertThat(response.getHeaders().getFirst("Accept-Ranges")).isEqualTo("bytes");
        assertThat(response.getBody()).containsExactly(1, 2, 3, 4);
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
