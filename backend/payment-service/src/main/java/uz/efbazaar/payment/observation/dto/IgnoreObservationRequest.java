package uz.efbazaar.payment.observation.dto;

import jakarta.validation.constraints.Size;

public record IgnoreObservationRequest(@Size(max = 500) String note) {}
