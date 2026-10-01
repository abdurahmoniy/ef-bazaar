package uz.efbazaar.marketplace.service;

import jakarta.persistence.criteria.Order;
import org.hibernate.query.criteria.HibernateCriteriaBuilder;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import uz.efbazaar.marketplace.domain.Listing;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/**
 * "Katta bozor" (?sort=valueScore,desc) sahifalari barqaror bo'lishi uchun: hisoblanmagan
 * (null) e'lonlar oxirida, teng ballar id bo'yicha. Spring Data JPA Criteria'da
 * NULLS LAST'ni e'tiborsiz qoldiradi, shuning uchun tartib Specification ichida Hibernate
 * API orqali qo'yiladi.
 */
public final class ListingSorts {

    private ListingSorts() {
    }

    public static Optional<Sort.Direction> valueScoreDirection(Pageable pageable) {
        return Optional.ofNullable(pageable.getSort().getOrderFor("valueScore"))
                .map(Sort.Order::getDirection);
    }

    public static Pageable withoutSort(Pageable pageable) {
        return PageRequest.of(pageable.getPageNumber(), pageable.getPageSize());
    }

    public static Specification<Listing> orderByValueScore(Sort.Direction dir, boolean statusFirst) {
        return (root, query, cb) -> {
            Class<?> type = query.getResultType();
            if (!Long.class.equals(type) && !long.class.equals(type)) {
                HibernateCriteriaBuilder hcb = (HibernateCriteriaBuilder) cb;
                List<Order> orders = new ArrayList<>();
                if (statusFirst) {
                    orders.add(cb.asc(root.get("status")));
                }
                orders.add(dir.isDescending()
                        ? hcb.desc(root.get("valueScore"), false)
                        : hcb.asc(root.get("valueScore"), false));
                orders.add(cb.asc(root.get("id")));
                query.orderBy(orders);
            }
            return null;
        };
    }
}
