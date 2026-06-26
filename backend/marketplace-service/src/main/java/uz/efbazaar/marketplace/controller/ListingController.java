package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.service.ListingViewAssembler;

import java.math.BigDecimal;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/listings")
@RequiredArgsConstructor
public class ListingController {

    private final ListingService listingService;
    private final ListingViewAssembler assembler;

    // ---------- Public: browse ----------

    @GetMapping
    public PageResponse<ListingResponse> browse(
            @AuthenticationPrincipal AuthenticatedUser viewer,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Integer minDivision,
            @RequestParam(required = false) Integer maxDivision,
            @RequestParam(required = false) Integer minTeamStrength,
            @RequestParam(required = false) Boolean hasGooglePlayLink,
            @RequestParam(required = false) Boolean priceNegotiable,
            @RequestParam(required = false) String valuablePlayer,
            @RequestParam(required = false) String search,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {

        ListingFilter filter = new ListingFilter(
                minPrice, maxPrice, minDivision, maxDivision, minTeamStrength,
                hasGooglePlayLink, priceNegotiable, valuablePlayer, search);
        Page<Listing> page = listingService.browse(filter, pageable);
        UUID viewerId = viewer == null ? null : viewer.userId();

        return new PageResponse<>(
                assembler.assembleAll(page.getContent(), viewerId),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }

    @GetMapping("/{id}")
    public ListingResponse get(@PathVariable UUID id,
                               @AuthenticationPrincipal AuthenticatedUser viewer) {
        Listing listing = listingService.getById(id);
        return assembler.assemble(listing, viewer == null ? null : viewer.userId());
    }

    // ---------- Protected ----------

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ListingResponse create(@AuthenticationPrincipal AuthenticatedUser user,
                                  @Valid @RequestBody ListingCreateRequest request) {
        Listing created = listingService.create(user.userId(), request);
        return assembler.assemble(created, user.userId());
    }

    @PutMapping("/{id}")
    public ListingResponse update(@AuthenticationPrincipal AuthenticatedUser user,
                                  @PathVariable UUID id,
                                  @Valid @RequestBody ListingUpdateRequest request) {
        Listing updated = listingService.update(id, user.userId(), request);
        return assembler.assemble(updated, user.userId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user,
                       @PathVariable UUID id) {
        listingService.delete(id, user.userId());
    }

    @PostMapping("/{id}/sold")
    public ListingResponse markSold(@AuthenticationPrincipal AuthenticatedUser user,
                                    @PathVariable UUID id) {
        Listing sold = listingService.markSold(id, user.userId());
        return assembler.assemble(sold, user.userId());
    }

    @GetMapping("/mine")
    public PageResponse<ListingResponse> mine(@AuthenticationPrincipal AuthenticatedUser user,
                                              @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Page<Listing> page = listingService.findMine(user.userId(), pageable);
        return new PageResponse<>(
                assembler.assembleAll(page.getContent(), user.userId()),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }
}
