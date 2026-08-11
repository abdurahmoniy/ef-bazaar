package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.dto.DreamTeamRequest;
import uz.efbazaar.marketplace.dto.DreamTeamResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.DreamTeamService;

import java.util.List;
import java.util.UUID;

/**
 * Saved squads. Always scoped to the caller — {@code userId} comes from the
 * nginx-injected principal, never from the request, so one user can't read or
 * edit another's team by id.
 */
@RestController
@RequestMapping("/api/v1/dream-teams")
@RequiredArgsConstructor
public class DreamTeamController {

    private final DreamTeamService service;

    @GetMapping
    public List<DreamTeamResponse> mine(@AuthenticationPrincipal AuthenticatedUser user) {
        return service.findMine(user.userId()).stream().map(DreamTeamResponse::from).toList();
    }

    @GetMapping("/{id}")
    public DreamTeamResponse get(@AuthenticationPrincipal AuthenticatedUser user,
                                 @PathVariable UUID id) {
        return DreamTeamResponse.from(service.get(id, user.userId()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public DreamTeamResponse create(@AuthenticationPrincipal AuthenticatedUser user,
                                    @Valid @RequestBody DreamTeamRequest request) {
        return DreamTeamResponse.from(service.create(user.userId(), request));
    }

    @PutMapping("/me")
    public DreamTeamResponse saveMine(@AuthenticationPrincipal AuthenticatedUser user,
                                      @Valid @RequestBody DreamTeamRequest request) {
        return DreamTeamResponse.from(service.saveMine(user.userId(), request));
    }

    @PutMapping("/{id}")
    public DreamTeamResponse update(@AuthenticationPrincipal AuthenticatedUser user,
                                    @PathVariable UUID id,
                                    @Valid @RequestBody DreamTeamRequest request) {
        return DreamTeamResponse.from(service.update(id, user.userId(), request));
    }

}
