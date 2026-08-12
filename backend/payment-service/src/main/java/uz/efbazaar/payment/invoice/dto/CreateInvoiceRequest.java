package uz.efbazaar.payment.invoice.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record CreateInvoiceRequest(@NotNull @Min(1) Long amountUzs) {}
