package uz.efbazaar.payment.plan.dto;
import java.time.Instant;
import java.util.UUID;
/** Durable user-owned notice; Telegram delivery is supplemental. */
public record PlanNoticeResponse(UUID id, String kind, Instant paidExpiresAt, Instant graceEndsAt,
                                Instant createdAt, Instant readAt) {}
