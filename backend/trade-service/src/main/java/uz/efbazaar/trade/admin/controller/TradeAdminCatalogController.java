package uz.efbazaar.trade.admin.controller;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.trade.admin.dto.TradeAdminCardResponse;
import uz.efbazaar.trade.admin.service.TradeAdminCatalogService;

import java.util.List;

/**
 * Hire-an-admin list, shown while the seller is composing a HUMAN proposal.
 * Any authenticated user may read it — it is a directory of people offering
 * a service, nothing private.
 *
 * <p>Not paginated: the population is tens of rows, and the sort only makes
 * sense over the whole set. Revisit together with the in-memory name filter
 * in {@link TradeAdminCatalogService} if that changes.
 */
@RestController
@RequestMapping("/api/v1/trade-admins")
@RequiredArgsConstructor
public class TradeAdminCatalogController {

    private final TradeAdminCatalogService catalog;

    @GetMapping
    public List<TradeAdminCardResponse> list(
            @RequestParam(required = false) String q,
            @RequestParam(defaultValue = "DEFAULT") TradeAdminCatalogService.CatalogSort sort) {
        return catalog.search(q, sort);
    }
}
