package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.Size;

public record TradeAdminApplicationDecisionRequest(
        @Size(max = 500) String note
) {}
