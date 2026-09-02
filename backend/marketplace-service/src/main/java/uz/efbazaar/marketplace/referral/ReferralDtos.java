package uz.efbazaar.marketplace.referral;

import jakarta.validation.constraints.NotBlank;

public final class ReferralDtos {

    private ReferralDtos() {}

    public record ClaimRequest(@NotBlank String code) {}

    public record ClaimResponse(boolean claimed) {}
}
