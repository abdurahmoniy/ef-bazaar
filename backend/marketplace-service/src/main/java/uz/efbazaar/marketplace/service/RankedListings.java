package uz.efbazaar.marketplace.service;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.jpa.domain.Specification;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.repository.ListingRepository;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

/**
 * recommendation-service tartiblagan ID'lar ustida marketplace filtrlarini qo'llaydi.
 * Filtr mantig'i bitta joyda qoladi (ListingSpecifications) — recommendation uni takrorlamaydi.
 * ID'lar ≤ 1000, shuning uchun tartib va sahifalash xotirada.
 */
public final class RankedListings {

    private RankedListings() {
    }

    public static Page<Listing> page(ListingRepository repo, List<UUID> ids, ListingFilter filter,
                                     int page, int size) {
        List<UUID> unique = List.copyOf(new LinkedHashSet<>(ids));
        if (unique.isEmpty()) {
            return Page.empty(PageRequest.of(page, size));
        }
        ListingFilter activeOnly = new ListingFilter(filter.minPrice(), filter.maxPrice(),
                filter.priceNegotiable(), filter.search(), filter.attributes(), false);
        Specification<Listing> idIn = (root, query, cb) -> root.get("id").in(unique);
        Map<UUID, Listing> found = repo.findAll(ListingSpecifications.withFilter(activeOnly).and(idIn)).stream()
                .collect(Collectors.toMap(Listing::getId, Function.identity()));
        List<Listing> ordered = unique.stream().map(found::get).filter(Objects::nonNull).toList();
        int from = (int) Math.min((long) page * size, ordered.size());
        int to = (int) Math.min((long) from + size, ordered.size());
        return new PageImpl<>(ordered.subList(from, to), PageRequest.of(page, size), ordered.size());
    }
}
