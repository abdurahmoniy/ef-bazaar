package uz.efbazaar.marketplace.controller;

import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import uz.efbazaar.marketplace.account.UserAccount;
import uz.efbazaar.marketplace.account.UserAccountRepository;
import uz.efbazaar.marketplace.account.UserAccountStatus;

import java.util.*;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InternalAccountControllerTest {

    private final UserAccountRepository accounts = mock(UserAccountRepository.class);
    private final InternalAccountController controller = new InternalAccountController(accounts);

    @Test
    void summarisesTheAccountForTradeService() {
        UUID id = UUID.randomUUID();
        UUID owner = UUID.randomUUID();
        UUID listing = UUID.randomUUID();
        when(accounts.findById(id)).thenReturn(Optional.of(UserAccount.builder()
                .id(id).ownerId(owner).title("Asosiy akk")
                .description("Juda   kuchli\nakkount " + "x".repeat(200))
                .attributes(new HashMap<>(Map.of("team_strength", 3250)))
                .mediaMessageIds(new ArrayList<>(List.of("m-1", "m-2")))
                .status(UserAccountStatus.ACTIVE).currentListingId(listing).build()));

        var summary = controller.summary(id);

        assertThat(summary.ownerId()).isEqualTo(owner);
        assertThat(summary.status()).isEqualTo("ACTIVE");
        assertThat(summary.title()).isEqualTo("Asosiy akk");
        assertThat(summary.coverMessageId()).isEqualTo("m-1");
        assertThat(summary.summary()).startsWith("Juda kuchli akkount").hasSizeLessThanOrEqualTo(81);
        assertThat(summary.teamStrength()).isEqualTo(3250);
        assertThat(summary.currentListingId()).isEqualTo(listing);
    }

    @Test
    void emptyFieldsStayEmpty() {
        UUID id = UUID.randomUUID();
        when(accounts.findById(id)).thenReturn(Optional.of(UserAccount.builder()
                .id(id).ownerId(UUID.randomUUID()).attributes(new HashMap<>())
                .mediaMessageIds(new ArrayList<>()).status(UserAccountStatus.ARCHIVED).build()));

        var summary = controller.summary(id);

        assertThat(summary.coverMessageId()).isNull();
        assertThat(summary.summary()).isEmpty();
        assertThat(summary.teamStrength()).isNull();
        assertThat(summary.status()).isEqualTo("ARCHIVED");
    }

    @Test
    void unknownAccountIs404() {
        UUID id = UUID.randomUUID();
        when(accounts.findById(id)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> controller.summary(id))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("404");
    }
}
