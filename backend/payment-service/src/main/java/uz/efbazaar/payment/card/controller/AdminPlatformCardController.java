package uz.efbazaar.payment.card.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.payment.card.dto.PlatformCardCreateRequest;
import uz.efbazaar.payment.card.dto.PlatformCardResponse;
import uz.efbazaar.payment.card.dto.ReorderCardsRequest;
import uz.efbazaar.payment.card.service.PlatformCardService;
import uz.efbazaar.payment.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/admin/payments/cards")
@PreAuthorize("hasAuthority('ROLE_ADMIN')")
@RequiredArgsConstructor
public class AdminPlatformCardController {

    private final PlatformCardService cards;

    @GetMapping
    public List<PlatformCardResponse> list() {
        return cards.listAll().stream().map(PlatformCardResponse::of).toList();
    }

    @PostMapping
    public PlatformCardResponse create(@AuthenticationPrincipal AuthenticatedUser me,
                                       @Valid @RequestBody PlatformCardCreateRequest req) {
        return PlatformCardResponse.of(cards.create(me.userId(), req));
    }

    @PostMapping("/{id}/deactivate")
    public void deactivate(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        cards.deactivate(me.userId(), id);
    }

    @PostMapping("/{id}/activate")
    public void activate(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        cards.activate(me.userId(), id);
    }

    /**
     * Permanently removes a card that has never taken a payment. A card with
     * history answers 409 — deactivate is the operation for that one.
     */
    @DeleteMapping("/{id}")
    public void delete(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id) {
        cards.delete(me.userId(), id);
    }

    @PostMapping("/reorder")
    public void reorder(@AuthenticationPrincipal AuthenticatedUser me,
                        @Valid @RequestBody ReorderCardsRequest req) {
        cards.reorder(me.userId(), req.orderedIds());
    }
}
