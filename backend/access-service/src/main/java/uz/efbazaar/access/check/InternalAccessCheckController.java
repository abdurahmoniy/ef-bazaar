package uz.efbazaar.access.check;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.access.check.AccessCheckService.CheckResult;

/** auth-service login paytida chaqiradi. {@code X-Internal-Secret} bilan himoyalangan. */
@RestController
@RequestMapping("/internal/access/v1")
@RequiredArgsConstructor
public class InternalAccessCheckController {

    private final AccessCheckService service;

    public record CheckRequest(@NotNull @Positive Long telegramId) {}

    @PostMapping("/check")
    public CheckResult check(@Valid @RequestBody CheckRequest request) {
        return service.check(request.telegramId());
    }
}
