package uz.efbazaar.trade.common;

import org.springframework.data.domain.Page;

import java.util.List;
import java.util.function.Function;

/**
 * Stable pagination envelope. Spring's {@code Page} serialises with an unstable
 * shape (and logs a warning about it), so admin endpoints return this instead —
 * same field names auth-service and marketplace-service already use, so the
 * frontend's {@code PageResponse<T>} type works unchanged.
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages
) {

    public static <E, T> PageResponse<T> of(Page<E> page, Function<E, T> mapper) {
        return new PageResponse<>(
                page.getContent().stream().map(mapper).toList(),
                page.getNumber(),
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages());
    }
}
