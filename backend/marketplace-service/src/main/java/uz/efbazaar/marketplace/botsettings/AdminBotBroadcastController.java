package uz.efbazaar.marketplace.botsettings;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.botsettings.BotBroadcastDtos.BroadcastResponse;
import uz.efbazaar.marketplace.botsettings.BotBroadcastDtos.CreateBroadcastRequest;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.UUID;

/** Adminka "Ommaviy xabar" tabi — /api/v1/admin/** SecurityConfig'da ROLE_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/bot-broadcasts")
@RequiredArgsConstructor
public class AdminBotBroadcastController {

    private final BotBroadcastService service;

    /**
     * Xabarni yaratadi va botga topshiradi.
     *
     * <p>202 qaytadi, 201 emas: javob kelganda xabar hali yuborilmagan,
     * faqat navbatga qo'yilgan. Jo'natish daqiqalar davom etadi va
     * adminka uni {@code GET /{id}} orqali kuzatadi.
     */
    @PostMapping(consumes = "multipart/form-data")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public BroadcastResponse send(@Valid @RequestPart("data") CreateBroadcastRequest request,
                                  @RequestPart(value = "banner", required = false) MultipartFile banner,
                                  @AuthenticationPrincipal AuthenticatedUser admin) {
        return BroadcastResponse.from(service.create(request, banner, admin.userId()));
    }

    @GetMapping
    public PageResponse<BroadcastResponse> history(@PageableDefault(size = 20) Pageable pageable) {
        return PageResponse.from(service.history(pageable), BroadcastResponse::from);
    }

    /** Ketayotgan jo'natma, yoki bo'sh javob — adminka progressni shundan oladi. */
    @GetMapping("/active")
    public BroadcastResponse active() {
        BotBroadcast active = service.activeOrNull();
        return active == null ? null : BroadcastResponse.from(active);
    }

    @GetMapping("/{id}")
    public BroadcastResponse get(@PathVariable UUID id) {
        return BroadcastResponse.from(service.get(id));
    }
}
