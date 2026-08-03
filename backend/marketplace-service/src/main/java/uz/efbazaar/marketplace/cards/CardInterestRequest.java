package uz.efbazaar.marketplace.cards;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CardInterestRequest(
        @NotEmpty @Size(max = 11) List<Long> efhubIds,
        @Size(max = 64)
        @Pattern(regexp = "[0-9a-fA-F-]{20,64}", message = "anonymousToken noto'g'ri")
        String anonymousToken
) {}
