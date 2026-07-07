package uz.efbazaar.auth.dto;

import jakarta.validation.constraints.NotNull;
import uz.efbazaar.auth.domain.Role;

public record UpdateRoleRequest(@NotNull Role role) {}
