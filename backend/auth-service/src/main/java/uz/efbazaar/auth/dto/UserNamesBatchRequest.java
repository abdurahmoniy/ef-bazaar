package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record UserNamesBatchRequest(
        @NotEmpty
        @Size(max = 100)
        List<UUID> ids
) {}
