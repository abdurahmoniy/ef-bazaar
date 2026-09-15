package uz.efbazaar.access.requirement;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.access.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

/** Admin panel: "Kirish shartlari" bo'limi. ROLE_ADMIN — SecurityConfig'da. */
@RestController
@RequestMapping("/api/v1/admin/access-requirements")
@RequiredArgsConstructor
public class AdminAccessRequirementController {

    private final AccessRequirementService service;

    public record AddTelegramChannelRequest(@NotBlank @Size(max = 200) String username) {}

    @GetMapping
    public List<RequirementView> list() {
        return service.list();
    }

    @PostMapping("/telegram-channels")
    @ResponseStatus(HttpStatus.CREATED)
    public RequirementView addTelegramChannel(@AuthenticationPrincipal AuthenticatedUser admin,
                                              @Valid @RequestBody AddTelegramChannelRequest request) {
        return service.addTelegramChannel(request.username(), admin.userId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser admin, @PathVariable UUID id) {
        service.delete(id, admin.userId());
    }
}
