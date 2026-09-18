package uz.efbazaar.marketplace.account;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.account.dto.UserAccountCreateRequest;
import uz.efbazaar.marketplace.account.dto.UserAccountEmailRequest;
import uz.efbazaar.marketplace.account.dto.UserAccountResponse;
import uz.efbazaar.marketplace.account.dto.PublishAccountRequest;
import uz.efbazaar.marketplace.account.dto.UserAccountUpdateRequest;
import uz.efbazaar.marketplace.dto.ListingResponse;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.ListingViewAssembler;

import java.util.List;
import java.util.UUID;

/**
 * "Akkountlarim" — har bir amal faqat egasining o'z akkountlari ustida.
 *
 * <p>Begona id 404 qaytaradi (403 emas): 403 javobning o'zi bunday
 * akkount borligini tasdiqlab qo'yardi.
 */
@RestController
@RequestMapping("/api/v1/accounts")
@RequiredArgsConstructor
public class UserAccountController {

    private final UserAccountService accounts;
    private final UserAccountPublisher publisher;
    private final ListingViewAssembler listingView;

    @GetMapping
    public List<UserAccountResponse> list(@AuthenticationPrincipal AuthenticatedUser user) {
        return accounts.list(user.userId()).stream().map(UserAccountResponse::of).toList();
    }

    @GetMapping("/{id}")
    public UserAccountResponse get(@AuthenticationPrincipal AuthenticatedUser user,
                                   @PathVariable UUID id) {
        return UserAccountResponse.of(accounts.get(id, user.userId()));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public UserAccountResponse create(@AuthenticationPrincipal AuthenticatedUser user,
                                      @Valid @RequestBody UserAccountCreateRequest request) {
        return UserAccountResponse.of(accounts.create(user.userId(), request));
    }

    @PatchMapping("/{id}")
    public UserAccountResponse update(@AuthenticationPrincipal AuthenticatedUser user,
                                      @PathVariable UUID id,
                                      @Valid @RequestBody UserAccountUpdateRequest request) {
        return UserAccountResponse.of(accounts.update(id, user.userId(), request));
    }

    @PatchMapping("/{id}/email")
    public UserAccountResponse setEmail(@AuthenticationPrincipal AuthenticatedUser user,
                                        @PathVariable UUID id,
                                        @Valid @RequestBody UserAccountEmailRequest request) {
        return UserAccountResponse.of(accounts.setEmail(id, user.userId(), request.email()));
    }

    /** Bozorga chiqarish: narx va shartlar shu so'rovda, qolgani akkountdan. */
    @PostMapping("/{id}/publish")
    public ListingResponse publish(@AuthenticationPrincipal AuthenticatedUser user,
                                   @PathVariable UUID id,
                                   @Valid @RequestBody PublishAccountRequest request) {
        return listingView.assemble(publisher.publish(id, user.userId(), request), user.userId());
    }

    @PostMapping("/{id}/unpublish")
    public UserAccountResponse unpublish(@AuthenticationPrincipal AuthenticatedUser user,
                                         @PathVariable UUID id) {
        return UserAccountResponse.of(publisher.unpublish(id, user.userId()));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user, @PathVariable UUID id) {
        accounts.delete(id, user.userId());
    }
}
