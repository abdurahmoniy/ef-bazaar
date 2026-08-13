package uz.efbazaar.payment.invoice.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

/**
 * The floor is deliberately 1 rather than the real minimum: that lives in
 * {@code payment.deposit.minimum-uzs} and is checked in the service, so it can
 * be tuned without a redeploy of the contract.
 *
 * <p>The ceiling exists for a different reason. {@code create} multiplies by 100
 * to reach tiyin, so without a bound a large enough request overflows a long and
 * surfaces as a confusing 409 from the slot allocator instead of the 400 it is.
 * 50 000 000 so'm is far above any real top-up and nowhere near the overflow.
 */
public record CreateInvoiceRequest(
        @NotNull @Min(1) @Max(50_000_000) Long amountUzs) {}
