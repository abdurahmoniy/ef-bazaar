package uz.efbazaar.marketplace.partner;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.Map;

/**
 * Admin panelidagi raqamli ishoralar.
 *
 * <p>Bitta endpoint barcha bo'limlar uchun — yangi bo'lim qo'shilganda
 * frontendda yangi so'rov emas, mavjud javobga yangi kalit qo'shiladi.
 */
@RestController
@RequestMapping("/api/v1/admin/badges")
@RequiredArgsConstructor
public class AdminBadgeController {

    private final AdminBadgeService badges;

    @GetMapping
    public Map<String, Long> badges(@AuthenticationPrincipal AuthenticatedUser admin) {
        return badges.countsFor(admin.userId());
    }

    /** Bo'lim ko'rildi — o'sha bo'lim ishorasi o'chadi. */
    @PostMapping("/{section}/seen")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void markSeen(@PathVariable String section,
                         @AuthenticationPrincipal AuthenticatedUser admin) {
        badges.markSeen(admin.userId(), section);
    }
}
