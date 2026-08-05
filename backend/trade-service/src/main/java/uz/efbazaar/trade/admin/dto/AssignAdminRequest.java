package uz.efbazaar.trade.admin.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

/** Seller re-invites an admin after a decline. Fee must sit in their band. */
public record AssignAdminRequest(
        @NotNull UUID adminId,
        @NotNull @Min(1) Long feeUzs
) {}
