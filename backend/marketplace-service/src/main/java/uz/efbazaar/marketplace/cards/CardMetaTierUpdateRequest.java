package uz.efbazaar.marketplace.cards;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.util.List;

/**
 * Admin bulk tier assignment. One request sets the same tier on every listed
 * card, so flipping a whole meta squad on/off is a single call.
 */
public record CardMetaTierUpdateRequest(
        @NotEmpty(message = "Kamida bitta karta tanlang")
        @Size(max = 500, message = "Bir so'rovda 500 tagacha karta")
        List<Long> efhubIds,

        @NotNull(message = "metaTier majburiy")
        MetaTier metaTier,

        @Min(value = 0, message = "priority 0 dan kam bo'lmasin")
        @Max(value = 100, message = "priority 100 dan oshmasin")
        Integer priority,

        Instant activeFrom,
        Instant activeUntil,

        @Size(max = 240, message = "Sabab 240 belgidan oshmasin")
        String reason
) {}
