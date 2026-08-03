package uz.efbazaar.marketplace.cards;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CardInterestRequest(
        @NotEmpty @Size(max = 11) List<Long> efhubIds
) {}
