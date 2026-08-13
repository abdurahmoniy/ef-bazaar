package uz.efbazaar.payment.observation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record ResolveObservationRequest(
        @NotNull UUID userId,
        /** Mandatory: an admin creating money by hand must say why. */
        @NotBlank @Size(max = 500) String note
) {}
