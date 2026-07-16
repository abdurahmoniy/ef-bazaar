package uz.efbazaar.trade.trade.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SendPasswordRequest(@NotBlank @Size(min = 4, max = 200) String password) {}
