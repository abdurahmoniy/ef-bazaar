package uz.efbazaar.marketplace.pricewatch;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import java.util.*;

@RestController
@RequestMapping("/api/v1/price-watches")
public class PriceWatchController {
    private final PriceWatchService watches;
    public PriceWatchController(PriceWatchService watches){this.watches=watches;}
    public record Create(@NotNull UUID listingId) {}
    public record Pause(@NotNull Boolean paused) {}
    public record Priorities(@NotNull @Size(max=1000) List<@NotNull UUID> ids) {}
    public record Preferences(@NotNull Boolean notificationsEnabled,@NotNull Boolean telegramEnabled) {}
    @GetMapping public PriceWatchService.View list(@AuthenticationPrincipal AuthenticatedUser user){return watches.list(user.userId());}
    @PostMapping @ResponseStatus(HttpStatus.CREATED) public PriceWatchService.Item create(@AuthenticationPrincipal AuthenticatedUser user,@Valid @RequestBody Create r){return watches.create(user.userId(),r.listingId());}
    @PatchMapping("/{id}") public PriceWatchService.Item pause(@AuthenticationPrincipal AuthenticatedUser user,@PathVariable UUID id,@Valid @RequestBody Pause r){return watches.pause(user.userId(),id,r.paused());}
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT) public void delete(@AuthenticationPrincipal AuthenticatedUser user,@PathVariable UUID id){watches.delete(user.userId(),id);}
    @PutMapping("/priorities") public PriceWatchService.View priorities(@AuthenticationPrincipal AuthenticatedUser user,@Valid @RequestBody Priorities r){return watches.priorities(user.userId(),r.ids());}
    @PutMapping("/preferences") public PriceWatchService.View preferences(@AuthenticationPrincipal AuthenticatedUser user,@Valid @RequestBody Preferences r){return watches.preferences(user.userId(),r.notificationsEnabled(),r.telegramEnabled());}
}
