package uz.efbazaar.bot.guide;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import uz.efbazaar.bot.settings.BotSettingsProperties;

import java.time.Duration;
import java.util.List;
import java.util.UUID;

/**
 * Qo'llanma tugmalarini marketplace'dan o'qiydi.
 *
 * <p>Yozuv, tavsif va `file_id` birga keladi: tugma bosilganda ikkinchi
 * so'rov kutilsa, foydalanuvchi javobni sekin oladi.
 *
 * <p>Xato bo'lsa BO'SH ro'yxat qaytadi, istisno emas: qo'llanmalar
 * yordamchi narsa va ular yuklanmagani `/start` ni sindirmasligi kerak.
 */
@Slf4j
@Component
public class GuideClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private static final ParameterizedTypeReference<List<GuideButtonView>> LIST =
            new ParameterizedTypeReference<>() {};

    private final WebClient marketplaceWebClient;
    private final BotSettingsProperties props;

    public GuideClient(WebClient marketplaceWebClient, BotSettingsProperties props) {
        this.marketplaceWebClient = marketplaceWebClient;
        this.props = props;
    }

    public List<GuideButtonView> buttons() {
        if (props.secret() == null || props.secret().isBlank()) return List.of();
        try {
            List<GuideButtonView> found = marketplaceWebClient.get()
                    .uri("/internal/marketplace/v1/guides/buttons")
                    .header("X-Internal-Secret", props.secret())
                    .retrieve()
                    .bodyToMono(LIST)
                    .timeout(TIMEOUT)
                    .block();
            return found == null ? List.of() : found;
        } catch (Exception e) {
            log.warn("Qo'llanma tugmalarini o'qib bo'lmadi: {}", e.getMessage());
            return List.of();
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record GuideButtonView(UUID guideId, String label,
                                  String description, String videoFileId,
                                  String mediaKind) {}
}
