package uz.efbazaar.marketplace.cards;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.EnumSet;
import java.util.List;
import java.util.Set;

@RestController
@RequestMapping("/api/v1/cards")
@RequiredArgsConstructor
public class CardController {

    private final CardSearchService searchService;

    @GetMapping("/search")
    public List<CardSearchResult> search(
            @RequestParam("q") String query,
            @RequestParam(value = "types", required = false) Set<CardType> types,
            @RequestParam(value = "limit", required = false) Integer limit) {
        return searchService.search(query, types == null ? EnumSet.allOf(CardType.class) : types, limit);
    }

    /**
     * Paginated catalog browse by type (no name query).
     * e.g. GET /api/v1/cards?types=BIGTIME&page=0&size=30
     */
    @GetMapping
    public CardPage browse(
            @RequestParam(value = "types", required = false) Set<CardType> types,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return searchService.browse(types == null ? EnumSet.allOf(CardType.class) : types, page, size);
    }
}
