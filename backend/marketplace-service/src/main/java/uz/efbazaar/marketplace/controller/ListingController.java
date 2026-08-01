package uz.efbazaar.marketplace.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.dto.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.service.CardMatchScorer;
import uz.efbazaar.marketplace.service.ListingService;
import uz.efbazaar.marketplace.service.ListingSpecifications;
import uz.efbazaar.marketplace.service.ListingViewAssembler;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/listings")
@RequiredArgsConstructor
public class ListingController {

    private static final String ATTR_PREFIX = "attr.";

    private final ListingService listingService;
    private final ListingViewAssembler assembler;
    private final CardMatchScorer matchScorer;

    // ---------- Public: browse ----------

    /**
     * Browse with typed filters + dynamic attribute equality via {@code ?attr.<key>=<value>}.
     * E.g. {@code ?attr.highest_division_level=7&attr.has_google_play_link=true}.
     * Numeric attributes also take range bounds: {@code ?attr.team_strength.min=2000&attr.team_strength.max=4000}.
     */
    @GetMapping
    public PageResponse<ListingResponse> browse(
            @AuthenticationPrincipal AuthenticatedUser viewer,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) Boolean priceNegotiable,
            @RequestParam(required = false) String search,
            @RequestParam Map<String, String> allParams,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {

        Map<String, Object> attributeFilters = extractAttributeFilters(allParams);
        ListingFilter filter = new ListingFilter(
                minPrice, maxPrice, priceNegotiable, search, attributeFilters);
        Page<Listing> page = listingService.browse(filter, pageable);
        UUID viewerId = viewer == null ? null : viewer.userId();

        // Attach the squad-coverage percentage the SQL ordering used but never
        // returns. No-op unless the caller sent a dream team.
        String wanted = attributeFilters.get(ListingSpecifications.DREAM_TEAM_KEY) == null
                ? null
                : String.valueOf(attributeFilters.get(ListingSpecifications.DREAM_TEAM_KEY));
        List<ListingResponse> content = assembler.assembleAll(page.getContent(), viewerId);
        if (wanted != null) {
            List<Listing> listings = page.getContent();
            List<ListingResponse> scored = new ArrayList<>(content.size());
            for (int i = 0; i < content.size(); i++) {
                scored.add(content.get(i).withMatchPercent(
                        matchScorer.percent(listings.get(i).getAttributes(), wanted)));
            }
            content = scored;
        }

        return new PageResponse<>(content,
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }

    @GetMapping("/{id}")
    public ListingResponse get(@PathVariable UUID id,
                               @AuthenticationPrincipal AuthenticatedUser viewer) {
        Listing listing = listingService.getById(id);
        return assembler.assemble(listing, viewer == null ? null : viewer.userId());
    }

    // ---------- Protected: atomic create/edit ----------

    /**
     * Atomic create — client sends {@code data} (JSON body) + {@code files}
     * (media) in one multipart request. Returns 200 only after both the bot
     * upload and the DB commit succeed.
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ListingResponse create(@AuthenticationPrincipal AuthenticatedUser user,
                                  @RequestPart("data") @Valid ListingCreateRequest data,
                                  @RequestPart("files") List<MultipartFile> files) {
        Listing created = listingService.create(user.userId(), data, files);
        return assembler.assemble(created, user.userId());
    }

    /**
     * Atomic full-edit — same shape as create. Media is replaced with the new
     * upload; old Telegram messages stay as audit trail. When the {@code files}
     * part is omitted or empty, the existing {@code mediaMessageIds} are kept
     * (used by the edit form to update text/attribute fields without re-uploading
     * photos). See {@link ListingService#update} for the ordering guarantees.
     */
    @PutMapping(path = "/{id}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ListingResponse update(@AuthenticationPrincipal AuthenticatedUser user,
                                  @PathVariable UUID id,
                                  @RequestPart("data") @Valid ListingUpdateRequest data,
                                  @RequestPart(name = "files", required = false) List<MultipartFile> files) {
        Listing updated = listingService.update(id, user.userId(), data,
                files == null ? List.of() : files);
        return assembler.assemble(updated, user.userId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(@AuthenticationPrincipal AuthenticatedUser user,
                       @PathVariable UUID id) {
        listingService.delete(id, user.userId());
    }

    @PostMapping("/{id}/sold")
    public ListingResponse markSold(@AuthenticationPrincipal AuthenticatedUser user,
                                    @PathVariable UUID id) {
        Listing sold = listingService.markSold(id, user.userId());
        return assembler.assemble(sold, user.userId());
    }

    @GetMapping("/me")
    public PageResponse<ListingResponse> mine(@AuthenticationPrincipal AuthenticatedUser user,
                                              @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Page<Listing> page = listingService.findMine(user.userId(), pageable);
        return new PageResponse<>(
                assembler.assembleAll(page.getContent(), user.userId()),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }

    @GetMapping("/liked")
    public PageResponse<ListingResponse> liked(@AuthenticationPrincipal AuthenticatedUser user,
                                               @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        Page<Listing> page = listingService.findLiked(user.userId(), pageable);
        return new PageResponse<>(
                assembler.assembleAll(page.getContent(), user.userId()),
                page.getNumber(), page.getSize(), page.getTotalElements(), page.getTotalPages());
    }

    // ---------- helpers ----------

    /**
     * Pull out {@code attr.<key>=<value>} query params from the flat request map.
     * The value stays a raw {@code String} — Specifications compare it stringly
     * via {@code jsonb_extract_path_text} which returns text for any JSON scalar.
     */
    private static Map<String, Object> extractAttributeFilters(Map<String, String> params) {
        Map<String, Object> out = new HashMap<>();
        for (Map.Entry<String, String> e : params.entrySet()) {
            String key = e.getKey();
            if (key.startsWith(ATTR_PREFIX) && key.length() > ATTR_PREFIX.length()) {
                String attrKey = key.substring(ATTR_PREFIX.length());
                out.put(attrKey, e.getValue());
            }
        }
        return out;
    }
}
