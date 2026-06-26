package uz.efbazaar.marketplace.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.domain.CartItem;
import uz.efbazaar.marketplace.dto.CartItemResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.CartService;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.service.ListingViewAssembler;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cart")
@RequiredArgsConstructor
public class CartController {

    private final CartService cartService;
    private final ListingService listingService;
    private final ListingViewAssembler assembler;

    @GetMapping
    public List<CartItemResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return cartService.list(user.userId()).stream()
                .map(ci -> new CartItemResponse(
                        ci.getId(),
                        ci.getListingId(),
                        assembler.assemble(listingService.getById(ci.getListingId()), user.userId()),
                        ci.getCreatedAt()))
                .toList();
    }

    @PostMapping("/{listingId}")
    @ResponseStatus(HttpStatus.CREATED)
    public CartItemResponse add(@AuthenticationPrincipal AuthenticatedUser user,
                                @PathVariable UUID listingId) {
        CartItem added = cartService.add(user.userId(), listingId);
        return new CartItemResponse(
                added.getId(), added.getListingId(),
                assembler.assemble(listingService.getById(listingId), user.userId()),
                added.getCreatedAt());
    }

    @DeleteMapping("/{listingId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void remove(@AuthenticationPrincipal AuthenticatedUser user,
                       @PathVariable UUID listingId) {
        cartService.remove(user.userId(), listingId);
    }
}
