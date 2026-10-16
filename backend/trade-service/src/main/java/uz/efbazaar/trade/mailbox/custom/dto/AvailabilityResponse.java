package uz.efbazaar.trade.mailbox.custom.dto;

/**
 * Whether a name is free, and separately whether this user may take it.
 *
 * <p>Two answers on purpose: a Jaydari user sees the ✓ for a free name and is
 * offered the plan that would let them claim it.
 *
 * @param reason     why it is not available: TAKEN, RESERVED, INVALID, DOMAIN_NOT_ALLOWED; null when available
 * @param claimBlock why this user cannot claim an available name: PLAN_DOMAIN, NO_SLOT; null when they can
 */
public record AvailabilityResponse(
        String email,
        boolean available,
        String reason,
        boolean canClaim,
        String claimBlock) {}
