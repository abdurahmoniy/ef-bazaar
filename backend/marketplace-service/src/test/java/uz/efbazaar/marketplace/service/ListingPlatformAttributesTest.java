package uz.efbazaar.marketplace.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mapstruct.factory.Mappers;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingCreateRequest;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.event.MarketplaceEventPublisher;
import uz.efbazaar.marketplace.mapper.ListingMapper;
import uz.efbazaar.marketplace.partner.ads.ChannelPostService;
import uz.efbazaar.marketplace.partner.ads.OfficialChannelService;
import uz.efbazaar.marketplace.partner.ads.SoldPostMarker;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;
import uz.efbazaar.marketplace.repository.ListingMatchRepository;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.trust.BlacklistGuard;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** Exercises the real attribute validator through the create/update persistence boundary. */
@ExtendWith(MockitoExtension.class)
class ListingPlatformAttributesTest {
    @Mock ListingRepository listings;
    @Mock OfficialChannelService officialChannel;
    @Mock SoldPostMarker soldPosts;
    @Mock AttributeDefinitionRepository definitions;
    @Mock CardIdentityVerifier cardIdentities;
    @Mock MediaService mediaService;
    @Mock ListingCaptionBuilder captionBuilder;
    @Mock MarketplaceEventPublisher events;
    @Mock BlacklistGuard blacklistGuard;
    @Mock ChannelPostService channelPosts;
    @Mock uz.efbazaar.marketplace.partner.ads.ChannelTakedown channelTakedown;
    @Mock ListingPersistence persistence;
    @Mock ListingMatchRepository listingMatches;

    private ListingService service;

    @BeforeEach
    void setUp() {
        service = new ListingService(listings, officialChannel, soldPosts, channelTakedown,
                Mappers.getMapper(ListingMapper.class),
                new AttributeValidator(definitions, cardIdentities), mediaService, captionBuilder, events,
                definitions, blacklistGuard, channelPosts, persistence, listingMatches,
                org.mockito.Mockito.mock(uz.efbazaar.marketplace.security.AuthSummaryClient.class),
                org.mockito.Mockito.mock(uz.efbazaar.marketplace.account.ListingAccountLink.class));
        when(definitions.findAllByActiveTrueOrderByPositionAsc())
                .thenReturn(AttributeValidatorTest.platformDefinitions(true));
        when(persistence.saveWithCardInventory(any(Listing.class))).thenAnswer(inv -> inv.getArgument(0));
    }

    @ParameterizedTest
    @ValueSource(strings = {"STEAM", "PLAYSTATION"})
    void console_creation_persists_negative_general_coin_balance(String platform) {
        when(captionBuilder.build(any(Listing.class))).thenReturn("Account");
        when(mediaService.uploadToBot(anyList(), anyString(), any(UUID.class))).thenReturn(List.of("image"));
        ListingCreateRequest request = new ListingCreateRequest("Console account", BigDecimal.TEN, false,
                Map.of("platform", platform, "team_strength", 3200, "coins", -250));

        Listing saved = service.create(UUID.randomUUID(), request, List.of());

        assertThat(saved.getAttributes()).containsExactlyInAnyOrderEntriesOf(
                Map.of("platform", platform, "team_strength", 3200L, "coins", -250L));
        verify(persistence).saveWithCardInventory(saved);
    }

    @ParameterizedTest
    @ValueSource(strings = {"STEAM", "PLAYSTATION"})
    void resaving_console_attributes_removes_stale_mobile_fields(String platform) {
        Listing listing = Listing.builder().id(UUID.randomUUID()).sellerId(UUID.randomUUID())
                .status(ListingStatus.ACTIVE).mediaMessageIds(List.of("image"))
                .attributes(Map.of("platform", platform, "team_strength", 3200, "coins", 500,
                        "android_coins", 120, "ios_coins", 0, "device_transfer_limit", 0,
                        "has_google_play_link", true, "has_game_center_link", true))
                .build();
        when(listings.findById(listing.getId())).thenReturn(Optional.of(listing));
        ListingUpdateRequest request = new ListingUpdateRequest(null, null, null, listing.getAttributes());

        Listing saved = service.update(listing.getId(), listing.getSellerId(), request, List.of());

        assertThat(saved.getAttributes()).containsExactlyInAnyOrderEntriesOf(
                Map.of("platform", platform, "team_strength", 3200L, "coins", 500L));
        verify(persistence).saveWithCardInventory(saved);
    }
}
