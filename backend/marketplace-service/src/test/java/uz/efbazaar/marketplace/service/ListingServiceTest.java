package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mapstruct.factory.Mappers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.domain.AttributeType;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.dto.ListingMatchHit;
import uz.efbazaar.marketplace.dto.MatchCardCriterion;
import uz.efbazaar.marketplace.dto.MatchRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.repository.ListingMatchRepository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingServiceTest {

    @Mock ListingRepository repository;
    @Mock MarketplaceEventPublisher events;
    @Mock AttributeValidator attributeValidator;
    @Mock MediaService mediaService;
    @Mock ListingCaptionBuilder captionBuilder;
    @Mock AttributeDefinitionRepository attributeDefinitions;
    @Mock ListingPersistence persistence;
    @Mock ListingMatchRepository listingMatches;
    @Spy  ListingMapper mapper = Mappers.getMapper(ListingMapper.class);

    @Mock uz.efbazaar.marketplace.trust.BlacklistGuard blacklistGuard;
    @InjectMocks ListingService service;

    private UUID sellerId;
    private ListingCreateRequest createReq;
    private List<MultipartFile> files;

    @BeforeEach
    void setUp() {
        sellerId = UUID.randomUUID();
        createReq = new ListingCreateRequest(
                "Strong eFootball account with Messi",
                new BigDecimal("450000.00"),
                true,
                Map.of(
                        "valuable_players", List.of("Messi", "Ronaldo"),
                        "highest_division_level", 5,
                        "android_coins", 100000,
                        "ios_coins", 50000,
                        "team_strength", 3200,
                        "has_google_play_link", true
                )
        );
        files = List.of(new MockMultipartFile(
                "files", "photo.jpg", "image/jpeg", new byte[]{1, 2, 3}));
    }

    @Test
    void create_ordersValidationsBeforeBotUploadAndPersists() {
        when(attributeValidator.validate(anyMap())).thenAnswer(inv -> inv.getArgument(0));
        when(captionBuilder.build(any(Listing.class))).thenReturn("Rich caption");
        when(mediaService.uploadToBot(anyList(), anyString(), any(UUID.class))).thenReturn(List.of("file_1"));
        when(persistence.saveWithCardInventory(any(Listing.class)))
                .thenAnswer(inv -> inv.getArgument(0));

        Listing saved = service.create(sellerId, createReq, files);

        // Files were validated before we touched the bot or DB.
        verify(mediaService).validate(files);
        // fileIds from bot are what got persisted.
        assertThat(saved.getMediaMessageIds()).containsExactly("file_1");
        assertThat(saved.getSellerId()).isEqualTo(sellerId);
        assertThat(saved.getStatus()).isEqualTo(ListingStatus.ACTIVE);
        assertThat(saved.getAttributes())
                .containsEntry("highest_division_level", 5)
                .containsEntry("valuable_players", List.of("Messi", "Ronaldo"));
        verify(persistence).saveWithCardInventory(saved);
        verify(events).listingCreated(saved);
    }

    @Test
    void update_rejectsNonOwner() {
        UUID otherUser = UUID.randomUUID();
        UUID listingId = UUID.randomUUID();
        Listing l = Listing.builder()
                .id(listingId)
                .sellerId(sellerId)
                .status(ListingStatus.ACTIVE)
                .build();
        when(repository.findById(listingId)).thenReturn(Optional.of(l));

        ListingUpdateRequest req = new ListingUpdateRequest(
                null, new BigDecimal("999.00"), null, null);

        assertThatThrownBy(() -> service.update(listingId, otherUser, req, files))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("egasi");
    }

    @Test
    void delete_setsStatusDeleted() {
        UUID listingId = UUID.randomUUID();
        Listing l = Listing.builder()
                .id(listingId).sellerId(sellerId).status(ListingStatus.ACTIVE).build();
        when(repository.findById(listingId)).thenReturn(Optional.of(l));
        when(repository.save(any(Listing.class))).thenAnswer(inv -> inv.getArgument(0));

        Listing result = service.delete(listingId, sellerId);
        assertThat(result.getStatus()).isEqualTo(ListingStatus.DELETED);
    }

    @Test
    void update_rejectsWhenAlreadySold() {
        UUID listingId = UUID.randomUUID();
        Listing l = Listing.builder()
                .id(listingId).sellerId(sellerId).status(ListingStatus.SOLD).build();
        when(repository.findById(listingId)).thenReturn(Optional.of(l));

        ListingUpdateRequest req = new ListingUpdateRequest(
                null, new BigDecimal("999.00"), null, null);

        assertThatThrownBy(() -> service.update(listingId, sellerId, req, files))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("aktiv emas");
    }

    @Test
    void getById_throwsWhenNotFound() {
        UUID listingId = UUID.randomUUID();
        when(repository.findById(listingId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.getById(listingId))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("topilmadi");
    }

    // ----- browse attribute range sanitization -----

    @Test
    void sanitizeRangeFilters_keepsNumericRangesDropsOthers() {
        when(attributeDefinitions.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of(
                definition("team_strength", AttributeType.INT),
                definition("exchange_mode", AttributeType.ENUM)));

        ListingFilter filter = new ListingFilter(null, null, null, null, Map.of(
                "team_strength.min", "2000",       // numeric definition — kept
                "team_strength.max", "4000",       // numeric definition — kept
                "exchange_mode.min", "BOTH",       // ENUM definition — dropped
                "unknown_attr.max", "5",           // no definition — dropped
                "exchange_mode", "BOTH"));         // plain equality — untouched

        ListingFilter cleaned = service.sanitizeRangeFilters(filter);

        assertThat(cleaned.attributes()).containsOnlyKeys(
                "team_strength.min", "team_strength.max", "exchange_mode");
    }

    @Test
    void sanitizeRangeFilters_skipsDefinitionLookupWithoutRangeKeys() {
        ListingFilter filter = new ListingFilter(null, null, null, null,
                Map.of("has_google_play_link", "true"));

        assertThat(service.sanitizeRangeFilters(filter)).isSameAs(filter);
        verifyNoInteractions(attributeDefinitions);
    }

    @Test
    void matched_browse_preserves_database_relevance_order_and_explanations() {
        UUID firstId = UUID.randomUUID();
        UUID secondId = UUID.randomUUID();
        MatchRequest match = new MatchRequest(List.of(new MatchCardCriterion(
                101L, UUID.randomUUID(), MatchCardCriterion.Importance.NORMAL)), 4);
        ListingFilter filter = new ListingFilter(null, null, null, null, Map.of());
        PageRequest pageable = PageRequest.of(0, 2);
        when(listingMatches.findMatches(filter, match, pageable)).thenReturn(new PageImpl<>(List.of(
                new ListingMatchHit(firstId, new BigDecimal("0.75"), 0, 1, 0),
                new ListingMatchHit(secondId, new BigDecimal("0.50"), 0, 1, 1)),
                pageable, 7));
        Listing first = Listing.builder().id(firstId).build();
        Listing second = Listing.builder().id(secondId).build();
        when(repository.findAllById(List.of(firstId, secondId))).thenReturn(List.of(second, first));

        MatchedListingPage result = service.browseMatched(filter, match, pageable);

        assertThat(result.listings()).extracting(Listing::getId)
                .containsExactly(firstId, secondId);
        assertThat(result.details().get(firstId).percent()).isEqualTo(75);
        assertThat(result.totalElements()).isEqualTo(7);
    }

    private static AttributeDefinition definition(String key, AttributeType type) {
        return AttributeDefinition.builder().key(key).type(type).build();
    }
}
