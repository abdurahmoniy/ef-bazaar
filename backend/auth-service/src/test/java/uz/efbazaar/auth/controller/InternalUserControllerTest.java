package uz.efbazaar.auth.controller;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import uz.efbazaar.auth.domain.User;
import uz.efbazaar.auth.dto.UserNamesBatchRequest;
import uz.efbazaar.auth.repository.UserRepository;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class InternalUserControllerTest {

    private final UserRepository userRepository = mock(UserRepository.class);
    private final InternalUserController controller = new InternalUserController(userRepository);

    /**
     * The roster exists so another service can address "the admins" at all —
     * notifications are per-user rows, and nothing outside auth knows who holds
     * the role.
     */
    @Test
    void listsAdminsWithTheirTelegramHandles() {
        User admin = new User();
        admin.setId(UUID.randomUUID());
        admin.setRole(uz.efbazaar.auth.domain.Role.ADMIN);
        admin.setTelegramUsername("boss");
        admin.setTelegramId(42L);
        when(userRepository.findByRole(uz.efbazaar.auth.domain.Role.ADMIN))
                .thenReturn(List.of(admin));

        var result = controller.admins();

        assertThat(result).singleElement().satisfies(summary -> {
            assertThat(summary.id()).isEqualTo(admin.getId());
            assertThat(summary.telegramUsername()).isEqualTo("boss");
            assertThat(summary.telegramId()).isEqualTo(42L);
        });
    }

    @Test
    void anInstallWithNoAdminsIsNotAnError() {
        // The caller must degrade to "nobody to tell", not throw — a payout
        // ticket still has to be created.
        when(userRepository.findByRole(uz.efbazaar.auth.domain.Role.ADMIN))
                .thenReturn(List.of());

        assertThat(controller.admins()).isEmpty();
    }

    @Test
    void resolvesKnownIds_omitsUnknown() {
        UUID knownId = UUID.randomUUID();
        UUID unknownId = UUID.randomUUID();
        User known = new User();
        known.setId(knownId);
        known.setTelegramFirstName("Aziz");
        known.setTelegramLastName("Rahmatov");

        when(userRepository.findAllById(List.of(knownId, unknownId)))
                .thenReturn(List.of(known));

        Map<UUID, String> result =
                controller.resolveNames(new UserNamesBatchRequest(List.of(knownId, unknownId)));

        assertThat(result).containsExactly(Map.entry(knownId, "Aziz Rahmatov"));
        assertThat(result).doesNotContainKey(unknownId);
    }

    @Test
    void returnsEmptyMap_whenNoUsersFound() {
        UUID id = UUID.randomUUID();
        when(userRepository.findAllById(List.of(id))).thenReturn(List.of());

        Map<UUID, String> result =
                controller.resolveNames(new UserNamesBatchRequest(List.of(id)));

        assertThat(result).isEmpty();
    }

    /**
     * Sahifa shaklini O'ZIMIZ belgilaymiz.
     *
     * <p>Ilgari bu endpoint Spring'ning `PageImpl` ini shundayligicha
     * qaytarardi va Spring buning uchun ogohlantiradi: bu JSON tuzilmasi
     * kafolatlanmagan, versiya yangilanganda o'zgarishi mumkin.
     *
     * <p>Bu yerda o'zgarish jimgina falokat bo'lardi. Bot sahifalashni
     * `last` bo'yicha to'xtatadi (`BroadcastExecutor:116`); maydon
     * yo'qolsa Jackson uni `false` qiladi va ommaviy jo'natish CHEKSIZ
     * aylanardi.
     */
    @Test
    @DisplayName("oxirgi sahifa last=true bilan keladi")
    void theLastPageSaysSo() {
        when(userRepository.findTelegramIds(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new org.springframework.data.domain.PageImpl<>(
                        List.of(1L, 2L),
                        org.springframework.data.domain.PageRequest.of(0, 500),
                        2));

        var page = controller.telegramIds(
                uz.efbazaar.auth.controller.InternalUserController.Audience.ALL,
                org.springframework.data.domain.PageRequest.of(0, 500));

        assertThat(page.content()).containsExactly(1L, 2L);
        assertThat(page.last()).isTrue();
        assertThat(page.totalElements()).isEqualTo(2);
    }

    @Test
    @DisplayName("oxirgi bo'lmagan sahifada last=false")
    void anEarlierPageIsNotTheLast() {
        when(userRepository.findTelegramIds(any(org.springframework.data.domain.Pageable.class)))
                .thenReturn(new org.springframework.data.domain.PageImpl<>(
                        List.of(1L),
                        org.springframework.data.domain.PageRequest.of(0, 1),
                        5));

        var page = controller.telegramIds(
                uz.efbazaar.auth.controller.InternalUserController.Audience.ALL,
                org.springframework.data.domain.PageRequest.of(0, 1));

        // Bu `false` bo'lmasa jo'natish birinchi sahifada to'xtardi va
        // qolgan foydalanuvchilar xabarni umuman olmasdi.
        assertThat(page.last()).isFalse();
    }
}
