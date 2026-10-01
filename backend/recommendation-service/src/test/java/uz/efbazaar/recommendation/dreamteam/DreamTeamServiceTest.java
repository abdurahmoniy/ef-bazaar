package uz.efbazaar.recommendation.dreamteam;
import uz.efbazaar.recommendation.match.CardIdentityVerifier;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import uz.efbazaar.recommendation.exception.RecommendationException;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DreamTeamServiceTest {

    @Mock DreamTeamRepository repository;
    @Mock CardIdentityVerifier identities;
    @Mock DreamTeamWriteLock writeLock;

    private DreamTeamService service;

    @BeforeEach
    void setUp() {
        service = new DreamTeamService(repository, identities, writeLock);
    }

    @Test
    void create_acceptsEachSupportedFormationAndUsesServerOwnedPositions() {
        when(repository.save(any(DreamTeam.class))).thenAnswer(invocation -> invocation.getArgument(0));
        for (String formation : List.of("4-3-3", "4-2-3-1", "3-5-2")) {
            UUID playerId = UUID.randomUUID();
            DreamTeam saved = service.create(UUID.randomUUID(), request(formation, List.of(
                    slot(0, "FORGED", 1, 100L, playerId))));

            assertThat(saved.getFormation()).isEqualTo(formation);
            assertThat(saved.getSlots()).singleElement()
                    .satisfies(slot -> assertThat(slot.get("position")).isEqualTo("GK"));
        }
    }

    @Test
    void create_allowsAValidPartialTeamAndVerifiesCanonicalClaims() {
        when(repository.save(any(DreamTeam.class))).thenAnswer(invocation -> invocation.getArgument(0));
        UUID playerId = UUID.randomUUID();
        DreamTeam saved = service.create(UUID.randomUUID(), request("4-3-3", List.of(
                slot(9, "anything", 3, 891L, playerId))));

        assertThat(saved.getSlots()).singleElement().satisfies(slot -> {
            assertThat(slot).containsEntry("index", 9).containsEntry("position", "CF").containsEntry("w", 3);
        });
        verify(identities).verify(List.of(new CardIdentityVerifier.Claim(891L, playerId)));
    }

    @Test
    void saveMine_createsTheUsersOnlyTeamWhenNoneExists() {
        UUID userId = UUID.randomUUID();
        UUID playerId = UUID.randomUUID();
        when(repository.findFirstByUserIdOrderByUpdatedAtDescCreatedAtDesc(userId))
                .thenReturn(java.util.Optional.empty());
        when(repository.save(any(DreamTeam.class))).thenAnswer(invocation -> invocation.getArgument(0));

        DreamTeam saved = service.saveMine(userId, request("4-3-3", List.of(
                slot(9, "CF", 3, 891L, playerId))));

        assertThat(saved.getUserId()).isEqualTo(userId);
        assertThat(saved.getName()).isEqualTo("Mening jamoam");
        assertThat(saved.getSlots()).singleElement()
                .satisfies(slot -> assertThat(slot).containsEntry("position", "CF"));
        var ordered = inOrder(writeLock, repository);
        ordered.verify(writeLock).acquire(userId);
        ordered.verify(repository).findFirstByUserIdOrderByUpdatedAtDescCreatedAtDesc(userId);
    }

    @Test
    void saveMine_updatesTheExistingTeamInsteadOfCreatingAnother() {
        UUID userId = UUID.randomUUID();
        DreamTeam existing = DreamTeam.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .name("Old name")
                .formation("4-3-3")
                .slots(List.of())
                .build();
        when(repository.findFirstByUserIdOrderByUpdatedAtDescCreatedAtDesc(userId))
                .thenReturn(java.util.Optional.of(existing));
        when(repository.save(existing)).thenReturn(existing);

        DreamTeam saved = service.saveMine(userId, request("3-5-2", List.of()));

        assertThat(saved).isSameAs(existing);
        assertThat(saved.getName()).isEqualTo("Mening jamoam");
        assertThat(saved.getFormation()).isEqualTo("3-5-2");
        verify(repository).save(existing);
    }

    @Test
    void create_rejectsUnsupportedFormation() {
        assertInvalid(request("5-5-0", List.of()), "formatsiya");
    }

    @Test
    void create_rejectsOutOfRangeOrDuplicateSlotIndexes() {
        assertInvalid(request("4-3-3", List.of(slot(11, "CF", 1, 1L, UUID.randomUUID()))), "slot");
        UUID first = UUID.randomUUID();
        UUID second = UUID.randomUUID();
        assertInvalid(request("4-3-3", List.of(
                slot(0, "GK", 1, 1L, first),
                slot(0, "GK", 1, 2L, second))), "slot");
    }

    @Test
    void create_rejectsDuplicateCanonicalPlayersEvenAcrossCardEditions() {
        UUID playerId = UUID.randomUUID();
        assertInvalid(request("4-3-3", List.of(
                slot(1, "LB", 1, 100L, playerId),
                slot(2, "CB", 1, 200L, playerId))), "takror");
    }

    @Test
    void create_rejectsInvalidPriorityAndMissingCanonicalIdentity() {
        assertInvalid(request("4-3-3", List.of(slot(1, "LB", 2, 100L, UUID.randomUUID()))), "vazn");
        assertInvalid(request("4-3-3", List.of(Map.of(
                "index", 1,
                "w", 1,
                "card", Map.of("efhubId", 100L, "name", "Legacy")))), "playerId");
    }

    private void assertInvalid(DreamTeamRequest request, String message) {
        assertThatThrownBy(() -> service.create(UUID.randomUUID(), request))
                .isInstanceOf(RecommendationException.class)
                .hasMessageContaining(message)
                .extracting(error -> ((RecommendationException) error).getCode())
                .isEqualTo("invalid_dream_team");
    }

    private static DreamTeamRequest request(String formation, List<Map<String, Object>> slots) {
        return new DreamTeamRequest("My XI", formation, slots);
    }

    private static Map<String, Object> slot(int index, String position, int weight,
                                             long efhubId, UUID playerId) {
        return Map.of(
                "index", index,
                "position", position,
                "w", weight,
                "card", Map.of(
                        "efhubId", efhubId,
                        "playerId", playerId.toString(),
                        "name", "Player"));
    }
}
