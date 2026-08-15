package uz.efbazaar.marketplace.dto;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/**
 * The requester is never in the body — it comes from {@code X-User-Id}, because
 * it decides who ends up buying and who ends up selling.
 */
public record AccountRequestCreateRequest(
        @NotNull(message = "E'lon tanlanishi shart")
        UUID listingId
) {}
