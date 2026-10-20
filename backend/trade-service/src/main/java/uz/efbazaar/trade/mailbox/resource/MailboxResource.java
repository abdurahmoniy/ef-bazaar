package uz.efbazaar.trade.mailbox.resource;

import java.time.Instant;
import java.util.UUID;

public record MailboxResource(UUID id, String email, UUID ownerUserId, UUID retainedUserId,
    String kind, String accessState, Instant paidExpiresAt, Instant graceEndsAt, boolean selectedForFree,
    boolean slotExempt, boolean activeTrade, Long usageBytes, Long quotaBytes, Instant usageObservedAt,
    String usageStatus, String usageError, Boolean mailcowPresent, boolean deleted,
    String deletionStatus, String deletionError, boolean legalHold, String holdReason, String provisioningStatus, UUID provisioningClaimId,
    String provisioningError) {}
