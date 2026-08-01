package uz.efbazaar.marketplace.cards;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

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
        MetaTier metaTier
) {}
