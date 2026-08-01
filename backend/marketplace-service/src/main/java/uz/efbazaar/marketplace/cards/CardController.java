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
            @RequestParam(value = "tier", required = false) MetaTier tier,
            @RequestParam(value = "limit", required = false) Integer limit) {
        return searchService.search(
                query,
                types == null ? EnumSet.allOf(CardType.class) : types,
                tier,
                limit);
    }

    /**
     * Paginated catalog browse. All filters optional:
     * e.g. {@code GET /api/v1/cards?types=BIGTIME&tier=META&q=ronaldo&page=0&size=30}.
     * {@code q} is ignored below 2 characters so an empty search box still
     * browses the whole catalogue.
     */
    @GetMapping
    public CardPage browse(
            @RequestParam(value = "q", required = false) String query,
            @RequestParam(value = "types", required = false) Set<CardType> types,
            @RequestParam(value = "tier", required = false) MetaTier tier,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "size", required = false) Integer size) {
        return searchService.browse(
                query,
                types == null ? EnumSet.allOf(CardType.class) : types,
                tier,
                page,
                size);
    }
}
