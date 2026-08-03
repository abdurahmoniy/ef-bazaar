package uz.efbazaar.marketplace.cards;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CardMetaExpireRequest(
        @NotEmpty @Size(max = 500) List<Long> efhubIds,
        @Size(max = 240) String reason
) {}
