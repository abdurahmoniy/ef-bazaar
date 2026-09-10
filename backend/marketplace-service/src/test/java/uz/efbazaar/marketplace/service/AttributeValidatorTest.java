package uz.efbazaar.marketplace.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.marketplace.domain.AttributeDefinition;
import uz.efbazaar.marketplace.domain.AttributeType;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.AttributeDefinitionRepository;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;

/**
 * Covers the {@code min_sellable} floor, whose whole point is to be a distinct
 * failure from {@code min}: 0 remaining device transfers is a truthful value,
 * it just makes the account impossible to hand over this month.
 */
@ExtendWith(MockitoExtension.class)
class AttributeValidatorTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Mock
    AttributeDefinitionRepository repository;

    @Mock
    CardIdentityVerifier cardIdentities;

    @InjectMocks
    AttributeValidator validator;

    @Test
    void device_transfer_limit_below_sellable_floor_is_rejected() {
        stubDeviceTransferLimit();

        assertThatThrownBy(() -> validator.validate(Map.of("device_transfer_limit", 1)))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("attribute_below_sellable_minimum"))
                .hasMessageContaining("kamida 2");
    }

    @Test
    void zero_remaining_transfers_is_rejected_as_unsellable_not_as_range_error() {
        stubDeviceTransferLimit();

        assertThatThrownBy(() -> validator.validate(Map.of("device_transfer_limit", 0)))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("attribute_below_sellable_minimum"));
    }

    @Test
    void exactly_the_floor_is_accepted() {
        stubDeviceTransferLimit();

        assertThat(validator.validate(Map.of("device_transfer_limit", 2)))
                .containsEntry("device_transfer_limit", 2L);
    }

    @Test
    void above_the_monthly_cap_is_a_plain_range_error() {
        stubDeviceTransferLimit();

        assertThatThrownBy(() -> validator.validate(Map.of("device_transfer_limit", 11)))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("invalid_attribute_value"));
    }

    @Test
    void missing_required_device_transfer_limit_is_rejected() {
        stubDeviceTransferLimit();

        assertThatThrownBy(() -> validator.validate(Map.of()))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("missing_required_attribute"));
    }

    @Test
    void card_list_requires_a_canonical_player_id() {
        stubCardList(30);

        assertThatThrownBy(() -> validator.validate(Map.of("valuable_players", List.of(
                Map.of("efhub_id", 101L, "name", "Messi")))))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("player_id");
    }

    @Test
    void card_list_rejects_duplicate_card_and_duplicate_player_ids() {
        stubCardList(30);
        UUID player = UUID.randomUUID();

        assertThatThrownBy(() -> validator.validate(Map.of("valuable_players", List.of(
                card(101L, player), card(101L, UUID.randomUUID())))))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("takrorlangan efhub_id");

        assertThatThrownBy(() -> validator.validate(Map.of("valuable_players", List.of(
                card(101L, player), card(202L, player)))))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("takrorlangan player_id");
    }

    @Test
    void card_list_accepts_thirty_distinct_verified_cards_and_rejects_thirty_one() {
        stubCardList(30);
        List<Map<String, Object>> thirty = IntStream.range(0, 30)
                .mapToObj(index -> card(1_000L + index, UUID.randomUUID()))
                .toList();

        assertThat(validator.validate(Map.of("valuable_players", thirty)))
                .containsEntry("valuable_players", thirty);
        verify(cardIdentities).verify(org.mockito.ArgumentMatchers.anyList());

        List<Map<String, Object>> thirtyOne = new java.util.ArrayList<>(thirty);
        thirtyOne.add(card(2_000L, UUID.randomUUID()));
        assertThatThrownBy(() -> validator.validate(Map.of("valuable_players", thirtyOne)))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("maksimum 30");
    }

    @ParameterizedTest
    @ValueSource(strings = {"STEAM", "PLAYSTATION", " STEAM "})
    void console_attributes_do_not_require_or_default_mobile_fields(String platform) {
        stubPlatformAttributes(true);

        assertThat(validator.validate(Map.of("platform", platform, "team_strength", 3200)))
                .containsExactlyInAnyOrderEntriesOf(Map.of("platform", platform.strip(), "team_strength", 3200L));
    }

    @ParameterizedTest
    @ValueSource(strings = {"STEAM", "PLAYSTATION"})
    void console_attributes_drop_stale_mobile_values_before_validation(String platform) {
        stubPlatformAttributes(true);
        Map<String, Object> input = new HashMap<>(Map.of(
                "platform", platform, "team_strength", 3200, "coins", "-250",
                "android_coins", "invalid", "ios_coins", 1.5,
                "has_google_play_link", "invalid", "has_game_center_link", "invalid",
                "device_transfer_limit", 0));

        assertThat(validator.validate(input)).containsExactlyInAnyOrderEntriesOf(
                Map.of("platform", platform, "team_strength", 3200L, "coins", -250L));
        assertThat(input).containsEntry("device_transfer_limit", 0);
    }

    @ParameterizedTest
    @ValueSource(strings = {"STEAM", "PLAYSTATION"})
    void console_coins_must_be_an_integer(String platform) {
        stubPlatformAttributes(true);

        assertThatThrownBy(() -> validator.validate(Map.of(
                "platform", platform, "team_strength", 3200, "coins", 1.5)))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("coins");
    }

    @Test
    void mobile_drops_console_coins_and_preserves_mobile_defaults_and_global_attributes() {
        stubPlatformAttributes(true);

        assertThat(validator.validate(Map.of(
                "platform", "MOBILE", "team_strength", 3200, "device_transfer_limit", 2,
                "coins", "invalid", "has_google_play_link", true)))
                .containsExactlyInAnyOrderEntriesOf(Map.of(
                        "platform", "MOBILE", "team_strength", 3200L, "device_transfer_limit", 2L,
                        "android_coins", 0L, "ios_coins", 0L, "has_google_play_link", true));
    }

    @Test
    void mobile_transfer_requirement_and_sellable_floor_remain_enforced() {
        stubPlatformAttributes(true);

        assertThatThrownBy(() -> validator.validate(Map.of("platform", "MOBILE", "team_strength", 3200)))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("device_transfer_limit");
        assertThatThrownBy(() -> validator.validate(Map.of(
                "platform", "MOBILE", "team_strength", 3200, "device_transfer_limit", 1)))
                .isInstanceOf(MarketplaceException.class)
                .satisfies(e -> assertThat(((MarketplaceException) e).getCode())
                        .isEqualTo("attribute_below_sellable_minimum"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"MOBILE", "STEAM", "PLAYSTATION"})
    void global_required_attributes_remain_required_on_every_platform(String platform) {
        stubPlatformAttributes(true);

        assertThatThrownBy(() -> validator.validate(Map.of("platform", platform, "device_transfer_limit", 2)))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("team_strength");
    }

    @Test
    void missing_optional_platform_keeps_legacy_mobile_behavior() {
        stubPlatformAttributes(false);

        assertThat(validator.validate(Map.of("team_strength", 3200, "device_transfer_limit", 2, "coins", 50)))
                .containsExactlyInAnyOrderEntriesOf(Map.of("team_strength", 3200L, "device_transfer_limit", 2L,
                        "android_coins", 0L, "ios_coins", 0L));
        assertThatThrownBy(() -> validator.validate(Map.of("team_strength", 3200)))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("device_transfer_limit");
    }

    @Test
    void required_or_invalid_platform_is_still_rejected() {
        stubPlatformAttributes(true);

        assertThatThrownBy(() -> validator.validate(Map.of("team_strength", 3200, "device_transfer_limit", 2)))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("platform");
        assertThatThrownBy(() -> validator.validate(Map.of(
                "platform", "PS", "team_strength", 3200, "device_transfer_limit", 2)))
                .isInstanceOf(MarketplaceException.class)
                .hasMessageContaining("platform");
    }

    private void stubPlatformAttributes(boolean platformRequired) {
        when(repository.findAllByActiveTrueOrderByPositionAsc()).thenReturn(platformDefinitions(platformRequired));
    }

    static List<AttributeDefinition> platformDefinitions(boolean platformRequired) {
        List<AttributeDefinition> definitions = new ArrayList<>();
        AttributeDefinition platform = definition("platform", "Platforma",
                "{\"options\":[\"MOBILE\",\"STEAM\",\"PLAYSTATION\"]}");
        platform.setType(AttributeType.ENUM);
        platform.setRequired(platformRequired);
        definitions.add(platform);
        definitions.add(definition("team_strength", "Team Strength", "{\"min\":1000,\"max\":5000}"));
        definitions.add(definition("device_transfer_limit", "Qurilma almashtirish limiti",
                "{\"min\":0,\"max\":10,\"min_sellable\":2}"));
        for (String key : List.of("android_coins", "ios_coins", "coins", "has_google_play_link", "has_game_center_link")) {
            AttributeDefinition def = definition(key, key, "{}");
            def.setRequired(false);
            if (key.startsWith("has_")) def.setType(AttributeType.BOOLEAN);
            definitions.add(def);
        }
        return definitions;
    }

    private void stubDeviceTransferLimit() {
        when(repository.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of(
                definition("device_transfer_limit", "Qurilma almashtirish limiti",
                        "{\"min\":0,\"max\":10,\"min_sellable\":2}")));
    }

    private void stubCardList(int maxItems) {
        AttributeDefinition def = definition("valuable_players", "Qidiriladigan kartalar",
                "{\"max_items\":" + maxItems + "}");
        def.setType(AttributeType.CARD_LIST);
        def.setRequired(false);
        when(repository.findAllByActiveTrueOrderByPositionAsc()).thenReturn(List.of(def));
    }

    private static Map<String, Object> card(long efhubId, UUID playerId) {
        return Map.of("efhub_id", efhubId, "player_id", playerId.toString(), "name", "Player " + efhubId);
    }

    private static AttributeDefinition definition(String key, String label, String constraints) {
        AttributeDefinition def = new AttributeDefinition();
        def.setKey(key);
        def.setLabelUz(label);
        def.setType(AttributeType.INT);
        def.setRequired(true);
        try {
            def.setConstraints(MAPPER.readTree(constraints));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        return def;
    }
}
