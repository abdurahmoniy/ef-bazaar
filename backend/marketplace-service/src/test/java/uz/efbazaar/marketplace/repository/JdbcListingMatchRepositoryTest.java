package uz.efbazaar.marketplace.repository;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import uz.efbazaar.marketplace.dto.ListingFilter;
import uz.efbazaar.marketplace.dto.MatchCardCriterion;
import uz.efbazaar.marketplace.dto.MatchRequest;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JdbcListingMatchRepositoryTest {

    @SuppressWarnings({"unchecked", "rawtypes"})
    @Test
    void query_scores_each_canonical_player_once_and_keeps_relevance_first() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        when(jdbc.queryForObject(anyString(), eq(Long.class), any(Object[].class))).thenReturn(1L);
        when(jdbc.query(anyString(), any(RowMapper.class), any(Object[].class))).thenReturn(List.of());
        JdbcListingMatchRepository repository = new JdbcListingMatchRepository(jdbc);
        MatchRequest request = new MatchRequest(List.of(
                new MatchCardCriterion(101L, UUID.randomUUID(), MatchCardCriterion.Importance.NORMAL),
                new MatchCardCriterion(202L, UUID.randomUUID(), MatchCardCriterion.Importance.PRIORITY)), 4);

        repository.findMatches(
                new ListingFilter(null, null, null, null, Map.of()),
                request,
                PageRequest.of(0, 20, Sort.by(Sort.Order.desc("price"))));

        ArgumentCaptor<String> sql = ArgumentCaptor.forClass(String.class);
        verify(jdbc).query(sql.capture(), any(RowMapper.class), any(Object[].class));
        assertThat(sql.getValue())
                .contains("WITH wanted(efhub_id, player_id, weight)")
                .contains("inventory.player_id = wanted.player_id")
                .contains("inventory.efhub_id = wanted.efhub_id THEN 1.0")
                .contains("THEN 0.75")
                .contains("SUM(weight * credit) / NULLIF(SUM(weight), 0)")
                .contains("CASE listing.status WHEN 'ACTIVE' THEN 0 ELSE 1 END")
                .contains("score DESC")
                .contains("listing.price DESC")
                .contains("listing_id ASC");
    }
}
