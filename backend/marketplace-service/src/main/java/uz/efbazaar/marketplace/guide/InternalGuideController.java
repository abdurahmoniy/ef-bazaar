package uz.efbazaar.marketplace.guide;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.guide.GuideDtos.BotGuideButton;

import java.util.List;

/**
 * Bot uchun tugmalar ro'yxati.
 *
 * <p>Yozuv, tavsif va `file_id` BIRGA qaytadi: tugma bosilganda bot
 * darrov video yubora olishi kerak va ikkinchi so'rov kutish javobni
 * sekinlashtirardi.
 */
@RestController
@RequestMapping("/internal/marketplace/v1/guides")
@RequiredArgsConstructor
public class InternalGuideController {

    private final GuideService service;

    @GetMapping("/buttons")
    public List<BotGuideButton> buttons() {
        return service.botButtons();
    }
}
