package uz.efbazaar.recommendation.watch;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.recommendation.security.AuthenticatedUser;
import uz.efbazaar.recommendation.watch.SavedSearchDtos.*;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/saved-searches")
@RequiredArgsConstructor
public class SavedSearchController {
    private final SavedSearchService service;
    @GetMapping public Listing list(@AuthenticationPrincipal AuthenticatedUser user) { return service.list(user.userId()); }
    @GetMapping("/{id}") public Item get(@AuthenticationPrincipal AuthenticatedUser user,@PathVariable UUID id) { return service.get(user.userId(),id); }
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    public Item create(@AuthenticationPrincipal AuthenticatedUser user,@RequestBody Request request) { return service.create(user.userId(),request); }
    @PutMapping("/{id}") public Item update(@AuthenticationPrincipal AuthenticatedUser user,@PathVariable UUID id,@RequestBody Request request) { return service.update(user.userId(),id,request); }
    @PatchMapping("/{id}") public Item patch(@AuthenticationPrincipal AuthenticatedUser user,@PathVariable UUID id,@RequestBody Patch patch) { return service.patch(user.userId(),id,patch); }
    @DeleteMapping("/{id}") @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user,@PathVariable UUID id) { service.delete(user.userId(),id); }
    @PutMapping("/priorities") public Listing priorities(@AuthenticationPrincipal AuthenticatedUser user,@RequestBody Priorities request) { return service.priorities(user.userId(),request.ids()); }
}
