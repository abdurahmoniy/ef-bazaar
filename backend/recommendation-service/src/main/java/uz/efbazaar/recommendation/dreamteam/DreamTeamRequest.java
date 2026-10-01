package uz.efbazaar.recommendation.dreamteam;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/**
 * Create/update payload for a saved squad.
 *
 * <p>Slots are passed through as-is (card snapshot included) — same contract as
 * {@code valuable_players}. Capped at 11 because that is a squad; a longer list
 * is a wishlist and would quietly skew match percentages.
 */
public record DreamTeamRequest(
        @NotBlank(message = "Jamoa nomi kerak")
        @Size(max = 80, message = "Nom 80 belgidan oshmasin")
        String name,

        @Size(max = 16)
        String formation,

        @Size(max = 11, message = "Jamoada 11 tagacha o'yinchi bo'ladi")
        List<Map<String, Object>> slots
) {}
