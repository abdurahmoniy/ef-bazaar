package uz.efbazaar.payment.wallet.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateTradeCommissionConfigRequest(
        @NotNull(message = "Chegara summasi kiritilishi shart")
        @Min(value = 1000, message = "Chegara kamida 1 000 so'm bo'lishi kerak")
        Long bandSom,

        @NotNull(message = "Pastki foiz stavkasi kiritilishi shart")
        @DecimalMin(value = "0.0", message = "Foiz 0 dan kam bo'lishi mumkin emas")
        @DecimalMax(value = "100.0", message = "Foiz 100 dan oshishi mumkin emas")
        Double lowRatePercent,

        @NotNull(message = "Yuqori foiz stavkasi kiritilishi shart")
        @DecimalMin(value = "0.0", message = "Foiz 0 dan kam bo'lishi mumkin emas")
        @DecimalMax(value = "100.0", message = "Foiz 100 dan oshishi mumkin emas")
        Double highRatePercent,

        @NotNull(message = "Pastki minimal summa kiritilishi shart")
        @Min(value = 0, message = "Minimal summa 0 dan kam bo'lishi mumkin emas")
        Long lowMinSom,

        @NotNull(message = "Yuqori minimal summa kiritilishi shart")
        @Min(value = 0, message = "Minimal summa 0 dan kam bo'lishi mumkin emas")
        Long highMinSom
) {}
