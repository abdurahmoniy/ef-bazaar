package uz.efbazaar.marketplace.cards;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.jdbc.core.JdbcTemplate;
import uz.efbazaar.marketplace.exception.MarketplaceException;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CardMetaLifecycleTest {

    @Test
    void activateOrSchedulePersistsPriorityWindowReasonAndActor() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CardColumns columns = mock(CardColumns.class);
        when(columns.has(anyString(), anyString())).thenReturn(true);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        CardSearchService service = new CardSearchService(jdbc, columns);
        UUID actor = UUID.randomUUID();
        Instant from = Instant.now().plusSeconds(3_600);
        Instant until = from.plusSeconds(86_400);

        int updated = service.updateMetaLifecycle(new CardMetaTierUpdateRequest(
                List.of(89138556575063L), MetaTier.META, 90, from, until, "  Tournament week  "), actor);

        assertThat(updated).isEqualTo(1);
        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(sql.capture(), args.capture());
        assertThat(sql.getValue()).contains("meta_priority = ?", "meta_active_from = ?",
                "meta_updated_by = ?", "meta_updated_at = NOW()");
        assertThat(args.getValue()).startsWith("META", 90, from, until, "Tournament week", actor);
    }

    @Test
    void normalTierClearsWindowAndPriorityButKeepsAuditReason() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        CardColumns columns = mock(CardColumns.class);
        when(columns.has(anyString(), anyString())).thenReturn(true);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        CardSearchService service = new CardSearchService(jdbc, columns);

        service.updateMetaLifecycle(new CardMetaTierUpdateRequest(
                List.of(89138556575063L), MetaTier.NORMAL, 99,
                Instant.now(), Instant.now().plusSeconds(100), "No longer competitive"), UUID.randomUUID());

        ArgumentCaptor<Object[]> args = ArgumentCaptor.forClass(Object[].class);
        verify(jdbc).update(anyString(), args.capture());
        assertThat(args.getValue()[0]).isEqualTo("NORMAL");
        assertThat(args.getValue()[1]).isEqualTo(0);
        assertThat(args.getValue()[2]).isNull();
        assertThat(args.getValue()[3]).isNull();
    }

    @Test
    void rejectsInvalidWindowPriorityAndReasonWithStableCode() {
        CardSearchService service = new CardSearchService(mock(JdbcTemplate.class), mock(CardColumns.class));
        Instant now = Instant.now();
        assertInvalid(service, new CardMetaTierUpdateRequest(List.of(89138556575063L),
                MetaTier.META, 101, null, null, null));
        assertInvalid(service, new CardMetaTierUpdateRequest(List.of(89138556575063L),
                MetaTier.META, 50, now.plusSeconds(20), now.plusSeconds(10), null));
        assertInvalid(service, new CardMetaTierUpdateRequest(List.of(89138556575063L),
                MetaTier.META, 50, null, now.minusSeconds(1), null));
        assertInvalid(service, new CardMetaTierUpdateRequest(List.of(89138556575063L),
                MetaTier.META, 50, null, null, "x".repeat(241)));
    }

    private static void assertInvalid(CardSearchService service, CardMetaTierUpdateRequest request) {
        assertThatThrownBy(() -> service.updateMetaLifecycle(request, UUID.randomUUID()))
                .isInstanceOf(MarketplaceException.class)
                .extracting(error -> ((MarketplaceException) error).getCode())
                .isEqualTo("invalid_meta_lifecycle");
    }
}
