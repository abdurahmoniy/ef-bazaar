package uz.efbazaar.marketplace.dto;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class ListingResponseTest {

    @Test
    void newListingsExposeZeroViews() {
        var listing = uz.efbazaar.marketplace.domain.Listing.builder().build();
        var mapper = org.mapstruct.factory.Mappers.getMapper(
                uz.efbazaar.marketplace.mapper.ListingMapper.class);
        var json = new com.fasterxml.jackson.databind.ObjectMapper()
                .valueToTree(mapper.toResponse(listing));

        assertThat(json.path("viewCount").asLong(-1)).isZero();
    }

    @Test
    void detailAndBrowseAssemblyKeepSavedViews() {
        var listing = uz.efbazaar.marketplace.domain.Listing.builder()
                .id(UUID.randomUUID()).sellerId(UUID.randomUUID()).viewCount(42).build();
        var mapper = org.mapstruct.factory.Mappers.getMapper(
                uz.efbazaar.marketplace.mapper.ListingMapper.class);
        var assembler = new uz.efbazaar.marketplace.service.ListingViewAssembler(mapper,
                org.mockito.Mockito.mock(uz.efbazaar.marketplace.service.LikeService.class),
                org.mockito.Mockito.mock(uz.efbazaar.marketplace.security.AuthSummaryClient.class));

        assertThat(assembler.assemble(listing, null).viewCount()).isEqualTo(42);
        assertThat(assembler.assembleAll(List.of(listing), null).getFirst().viewCount()).isEqualTo(42);
    }

    @Test
    void one_match_explanation_drives_both_new_and_compatibility_fields() {
        SellerSummary seller = new SellerSummary(
                UUID.randomUUID(), "Seller", "https://photo.jpg", true, java.time.Instant.now()
        );
        ListingResponse response = new ListingResponse(
                UUID.randomUUID(), seller.id(), seller, "Account", BigDecimal.TEN,
                false, Map.of(), List.of(), null, null, 0, 42, 0, null,
                null, null, null, null);
        MatchDetails details = new MatchDetails(75, 1, 2, 8, 11, 4);

        ListingResponse matched = response.withMatchDetails(details);

        assertThat(matched.matchDetails()).isEqualTo(details);
        assertThat(matched.matchPercent()).isEqualTo(75);
        assertThat(matched.seller()).isEqualTo(seller);
        assertThat(matched.viewCount()).isEqualTo(42);
        assertThat(response.withMatchPercent(50).viewCount()).isEqualTo(42);
    }
}
