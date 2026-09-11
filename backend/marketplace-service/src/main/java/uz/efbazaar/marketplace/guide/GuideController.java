package uz.efbazaar.marketplace.guide;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.guide.GuideDtos.GuideResponse;

import java.util.List;

/**
 * Ommaviy video qo'llanmalar — /api/v1/guides (public).
 *
 * <p>Yordam markazi (/help) sahifasida barcha foydalanuvchilar (shu jumladan
 * mehmonlar) video qo'llanmalarni toifalar bo'yicha ko'rishi uchun.
 */
@RestController
@RequestMapping("/api/v1/guides")
@RequiredArgsConstructor
public class GuideController {

    private final GuideService service;

    @GetMapping
    public List<GuideResponse> list(@RequestParam(value = "category", required = false) String category) {
        return service.listByCategory(category);
    }
}
