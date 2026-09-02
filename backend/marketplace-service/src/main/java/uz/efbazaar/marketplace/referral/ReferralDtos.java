package uz.efbazaar.marketplace.referral;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public final class ReferralDtos {

    private ReferralDtos() {}

    public record ClaimRequest(@NotBlank String code) {}

    public record ClaimResponse(boolean claimed) {}

    /** Foydalanuvchining o'z taklif sahifasi. */
    public record MyReferralsResponse(
            String code,
            long invitedCount,
            long rewardedCount,
            BigDecimal earnedSom,
            /** Ayni paytdagi sozlama — "har biri uchun N so'm" deb ko'rsatish uchun. */
            BigDecimal rewardSom,
            List<InvitedUser> invited) {}

    /** Taklif qilingan odam. Ism auth-service'dan qo'shiladi. */
    public record InvitedUser(
            UUID userId,
            String displayName,
            Instant joinedAt,
            Instant rewardedAt,
            /** To'lov paytida muhrlangan summa, bugungi sozlama emas. */
            BigDecimal rewardSom) {}

    /** Adminka reytingi. */
    public record ReferrerRow(
            UUID userId,
            String displayName,
            String telegramUsername,
            long invitedCount,
            long rewardedCount,
            BigDecimal earnedSom) {}

    public record ReferralSettingsResponse(BigDecimal rewardSom, Instant updatedAt) {
        public static ReferralSettingsResponse from(ReferralSettings s) {
            return new ReferralSettingsResponse(s.getRewardSom(), s.getUpdatedAt());
        }
    }

    public record UpdateReferralSettingsRequest(@NotNull @PositiveOrZero BigDecimal rewardSom) {}
}
