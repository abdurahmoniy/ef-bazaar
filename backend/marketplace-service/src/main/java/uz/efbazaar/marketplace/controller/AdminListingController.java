package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingResponse;
import uz.efbazaar.marketplace.dto.PageResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.service.ListingViewAssembler;

import java.util.UUID;

/**
 * Listing moderation — browse across every seller/status, take down or restore.
 * Gated by {@code ROLE_ADMIN} in {@link uz.efbazaar.marketplace.config.SecurityConfig}.
 */
@RestController
@RequestMapping("/api/v1/admin/listings")
@RequiredArgsConstructor
public class AdminListingController {

    private final ListingService listingService;
    private final ListingViewAssembler assembler;

    @GetMapping
    public PageResponse<ListingResponse> list(
            @AuthenticationPrincipal AuthenticatedUser admin,
            @RequestParam(required = false) ListingStatus status,
            /** Sotuvchining id si. Nom/username bo'yicha qidiruvni admin UI
             *  auth-service'da hal qiladi va bu yerga tayyor id keladi. */
            @RequestParam(required = false) UUID ownerId,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Page<Listing> page = listingService.findForAdmin(status, ownerId, pageable);
        return new PageResponse<>(
                assembler.assembleAll(page.getContent(), admin.userId()),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser admin,
                       @PathVariable UUID id) {
        listingService.adminDelete(id, admin.userId());
    }

    @PostMapping("/{id}/sold")
    public ListingResponse markSold(@AuthenticationPrincipal AuthenticatedUser admin,
                                    @PathVariable UUID id) {
        Listing sold = listingService.adminMarkSold(id, admin.userId());
        return assembler.assemble(sold, admin.userId());
    }

    @PostMapping("/{id}/restore")
    public ListingResponse restore(@AuthenticationPrincipal AuthenticatedUser admin,
                                   @PathVariable UUID id) {
        Listing restored = listingService.adminRestore(id, admin.userId());
        return assembler.assemble(restored, admin.userId());
    }
}
