package uz.efbazaar.payment.wallet;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Example;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.repository.query.FluentQuery;
import uz.efbazaar.payment.wallet.domain.TradeCommissionConfig;
import uz.efbazaar.payment.wallet.dto.TradeCommissionConfigResponse;
import uz.efbazaar.payment.wallet.dto.UpdateTradeCommissionConfigRequest;
import uz.efbazaar.payment.wallet.repository.TradeCommissionConfigRepository;
import uz.efbazaar.payment.wallet.service.TradeCommissionService;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.function.Function;

import static org.assertj.core.api.Assertions.assertThat;

class TradeCommissionServiceTest {

    private FakeTradeCommissionConfigRepository repository;
    private TradeCommissionService service;

    private static long som(long s) {
        return s * 100;
    }

    @BeforeEach
    void setUp() {
        repository = new FakeTradeCommissionConfigRepository();
        service = new TradeCommissionService(repository);
    }

    @Test
    void defaultValuesMatchStandardRules() {
        assertThat(service.feeTiyin(som(90_000))).isEqualTo(som(9_000));
        assertThat(service.feeTiyin(som(500_000))).isEqualTo(som(37_500));
        assertThat(service.feeTiyin(som(20_000))).isEqualTo(som(5_000)); // floor binds
        assertThat(service.feeTiyin(som(100_000))).isEqualTo(som(10_000)); // higher floor binds
    }

    @Test
    void customConfigUpdatesCalculationDynamically() {
        TradeCommissionConfig custom = TradeCommissionConfig.builder()
                .id(TradeCommissionConfig.DEFAULT_ID)
                .bandSom(200_000L)
                .lowRatePercent(8.0)
                .highRatePercent(5.0)
                .lowMinSom(4_000L)
                .highMinSom(8_000L)
                .active(true)
                .updatedAt(Instant.now())
                .build();

        repository.save(custom);

        // 100 000 som is now below the 200 000 band -> 8% (8 000 som)
        assertThat(service.feeTiyin(som(100_000))).isEqualTo(som(8_000));
        // 500 000 som is above 200 000 band -> 5% (25 000 som)
        assertThat(service.feeTiyin(som(500_000))).isEqualTo(som(25_000));
        assertThat(service.sellerProceedsTiyin(som(500_000))).isEqualTo(som(475_000));
    }

    @Test
    void updateConfigPersistsAndUpdatesCache() {
        UUID adminId = UUID.randomUUID();
        UpdateTradeCommissionConfigRequest req = new UpdateTradeCommissionConfigRequest(
                150_000L, 9.0, 6.0, 4_500L, 9_000L
        );

        TradeCommissionConfigResponse response = service.updateConfig(adminId, req);

        assertThat(response.bandSom()).isEqualTo(150_000L);
        assertThat(response.lowRatePercent()).isEqualTo(9.0);
        assertThat(response.highRatePercent()).isEqualTo(6.0);
        assertThat(response.lowMinSom()).isEqualTo(4_500L);
        assertThat(response.highMinSom()).isEqualTo(9_000L);
        assertThat(response.updatedBy()).isEqualTo(adminId);

        // Subsequent calculation should immediately use the new rates
        assertThat(service.feeTiyin(som(100_000))).isEqualTo(som(9_000)); // 9%
        assertThat(service.feeTiyin(som(300_000))).isEqualTo(som(18_000)); // 6%
    }

    private static class FakeTradeCommissionConfigRepository implements TradeCommissionConfigRepository {
        private final Map<String, TradeCommissionConfig> storage = new HashMap<>();

        @Override
        public Optional<TradeCommissionConfig> findById(String id) {
            return Optional.ofNullable(storage.get(id));
        }

        @Override
        public <S extends TradeCommissionConfig> S save(S entity) {
            storage.put(entity.getId(), entity);
            return entity;
        }

        @Override public void flush() {}
        @Override public <S extends TradeCommissionConfig> S saveAndFlush(S entity) { return save(entity); }
        @Override public <S extends TradeCommissionConfig> List<S> saveAllAndFlush(Iterable<S> entities) { throw new UnsupportedOperationException(); }
        @Override public void deleteAllInBatch(Iterable<TradeCommissionConfig> entities) {}
        @Override public void deleteAllByIdInBatch(Iterable<String> strings) {}
        @Override public void deleteAllInBatch() {}
        @Override public TradeCommissionConfig getOne(String s) { return storage.get(s); }
        @Override public TradeCommissionConfig getById(String s) { return storage.get(s); }
        @Override public TradeCommissionConfig getReferenceById(String s) { return storage.get(s); }
        @Override public <S extends TradeCommissionConfig> Optional<S> findOne(Example<S> example) { throw new UnsupportedOperationException(); }
        @Override public <S extends TradeCommissionConfig> List<S> findAll(Example<S> example) { throw new UnsupportedOperationException(); }
        @Override public <S extends TradeCommissionConfig> List<S> findAll(Example<S> example, Sort sort) { throw new UnsupportedOperationException(); }
        @Override public <S extends TradeCommissionConfig> Page<S> findAll(Example<S> example, Pageable pageable) { throw new UnsupportedOperationException(); }
        @Override public <S extends TradeCommissionConfig> long count(Example<S> example) { return 0; }
        @Override public <S extends TradeCommissionConfig> boolean exists(Example<S> example) { return false; }
        @Override public <S extends TradeCommissionConfig, R> R findBy(Example<S> example, Function<FluentQuery.FetchableFluentQuery<S>, R> queryFunction) { throw new UnsupportedOperationException(); }
        @Override public <S extends TradeCommissionConfig> List<S> saveAll(Iterable<S> entities) { throw new UnsupportedOperationException(); }
        @Override public boolean existsById(String s) { return storage.containsKey(s); }
        @Override public List<TradeCommissionConfig> findAll() { return List.copyOf(storage.values()); }
        @Override public List<TradeCommissionConfig> findAllById(Iterable<String> strings) { throw new UnsupportedOperationException(); }
        @Override public long count() { return storage.size(); }
        @Override public void deleteById(String s) { storage.remove(s); }
        @Override public void delete(TradeCommissionConfig entity) { storage.remove(entity.getId()); }
        @Override public void deleteAllById(Iterable<? extends String> strings) { throw new UnsupportedOperationException(); }
        @Override public void deleteAll(Iterable<? extends TradeCommissionConfig> entities) { storage.clear(); }
        @Override public void deleteAll() { storage.clear(); }
        @Override public List<TradeCommissionConfig> findAll(Sort sort) { throw new UnsupportedOperationException(); }
        @Override public Page<TradeCommissionConfig> findAll(Pageable pageable) { throw new UnsupportedOperationException(); }
    }
}
