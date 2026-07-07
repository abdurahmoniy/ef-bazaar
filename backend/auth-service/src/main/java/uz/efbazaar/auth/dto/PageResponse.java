package uz.efbazaar.auth.dto;

import java.util.List;

/** Same wire shape as marketplace-service's PageResponse so the frontend reuses one type. */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages
) {}
