package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PostTextRequest(@NotBlank @Size(max = 2000) String text) {}
