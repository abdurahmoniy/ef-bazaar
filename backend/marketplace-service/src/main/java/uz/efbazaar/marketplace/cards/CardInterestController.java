package uz.efbazaar.marketplace.cards;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

@RestController
@RequestMapping("/api/v1/card-interest")
@RequiredArgsConstructor
public class CardInterestController {

    private final CardInterestService service;

    @PostMapping("/apply")
    public CardInterestResponse apply(
            @AuthenticationPrincipal AuthenticatedUser user,
            @RequestHeader(name = "X-Interest-Network", required = false) String networkIdentity,
            @Valid @RequestBody CardInterestRequest request) {
        return service.recordApply(request.efhubIds(),
                user == null ? null : user.userId(), networkIdentity);
    }
}
