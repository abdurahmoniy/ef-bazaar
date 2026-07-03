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
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.repository.ListingRepository;

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
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ListingServiceTest {

    @Mock ListingRepository repository;
    @Mock MarketplaceEventPublisher events;
    @Mock AttributeValidator attributeValidator;
    @Mock MediaService mediaService;
    @Mock ListingCaptionBuilder captionBuilder;
    @Spy  ListingMapper mapper = Mappers.getMapper(ListingMapper.class);

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
        when(repository.save(any(Listing.class))).thenAnswer(inv -> inv.getArgument(0));

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
}
