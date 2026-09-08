package uz.efbazaar.marketplace.emoji;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.emoji.EmojiPackDtos.AddPackRequest;
import uz.efbazaar.marketplace.emoji.EmojiPackDtos.PackDetail;
import uz.efbazaar.marketplace.emoji.EmojiPackDtos.PackSummary;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/** Adminka "Bot → Emoji" bo'limi — /api/v1/admin/** SecurityConfig'da ROLE_ADMIN. */
@RestController
@RequestMapping("/api/v1/admin/emoji-packs")
@RequiredArgsConstructor
public class AdminEmojiPackController {

    private final EmojiPackService service;

    @GetMapping
    public List<PackSummary> list() {
        return service.list().stream().map(PackSummary::from).toList();
    }

    @GetMapping("/{id}")
    public PackDetail get(@PathVariable UUID id) {
        return PackDetail.from(service.get(id));
    }

    @PostMapping
    public PackSummary add(@Valid @RequestBody AddPackRequest request,
                           @AuthenticationPrincipal AuthenticatedUser admin) {
        return PackSummary.from(service.add(request.link(), admin.userId()));
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable UUID id) {
        service.delete(id);
    }
}
