package uz.efbazaar.marketplace.account.dto;

import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.Map;

/** Null maydon "tegilmasin" degani — PATCH semantikasi. */
public record UserAccountUpdateRequest(
        @Size(max = 120) String title,
        @Size(max = 4000) String description,
        Map<String, Object> attributes,
        List<String> mediaMessageIds) {}
