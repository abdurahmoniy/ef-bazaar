package uz.efbazaar.payment.wallet.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uz.efbazaar.payment.wallet.domain.TradeCommissionConfig;
import uz.efbazaar.payment.wallet.dto.TradeCommissionConfigResponse;
import uz.efbazaar.payment.wallet.dto.UpdateTradeCommissionConfigRequest;
import uz.efbazaar.payment.wallet.repository.TradeCommissionConfigRepository;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicReference;

@Slf4j
@Service
@RequiredArgsConstructor
public class TradeCommissionService {

    private final TradeCommissionConfigRepository repository;
    private final AtomicReference<TradeCommissionConfig> cachedConfig = new AtomicReference<>();

    public TradeCommissionConfig getActiveConfig() {
        TradeCommissionConfig cached = cachedConfig.get();
        if (cached != null) {
            return cached;
        }

        TradeCommissionConfig config = repository.findById(TradeCommissionConfig.DEFAULT_ID)
                .orElseGet(this::createDefaultFallback);

        cachedConfig.set(config);
        return config;
    }

    public TradeCommissionConfigResponse getConfigResponse() {
        return TradeCommissionConfigResponse.of(getActiveConfig());
    }

    @Transactional
    public TradeCommissionConfigResponse updateConfig(UUID adminId, UpdateTradeCommissionConfigRequest req) {
        TradeCommissionConfig config = repository.findById(TradeCommissionConfig.DEFAULT_ID)
                .orElseGet(() -> TradeCommissionConfig.builder()
                        .id(TradeCommissionConfig.DEFAULT_ID)
                        .active(true)
                        .updatedAt(Instant.now())
                        .build());

        config.setBandSom(req.bandSom());
        config.setLowRatePercent(req.lowRatePercent());
        config.setHighRatePercent(req.highRatePercent());
        config.setLowMinSom(req.lowMinSom());
        config.setHighMinSom(req.highMinSom());
        config.setActive(true);
        config.setUpdatedBy(adminId);
        config.setUpdatedAt(Instant.now());

        TradeCommissionConfig saved = repository.save(config);
        cachedConfig.set(saved);
        log.info("Admin {} updated trade commission config: band={} som, lowRate={}% (min {} som), highRate={}% (min {} som)",
                adminId, req.bandSom(), req.lowRatePercent(), req.lowMinSom(), req.highRatePercent(), req.highMinSom());

        return TradeCommissionConfigResponse.of(saved);
    }

    /**
     * @param priceTiyin what the buyer pays, which is the listed price in tiyin (1 so'm = 100 tiyin)
     * @return the platform's share in tiyin, never negative and never more than the price
     */
    public long feeTiyin(long priceTiyin) {
        if (priceTiyin <= 0) {
            throw new IllegalArgumentException("A trade price must be positive, got " + priceTiyin);
        }

        TradeCommissionConfig config = getActiveConfig();
        long bandTiyin = config.getBandSom() * 100L;
        boolean isLow = priceTiyin < bandTiyin;

        double ratePercent = isLow ? config.getLowRatePercent() : config.getHighRatePercent();
        long floorTiyin = (isLow ? config.getLowMinSom() : config.getHighMinSom()) * 100L;

        // Apply rate using pure integer permille logic to avoid float rounding anomalies
        // ratePercent 10.0% -> 100 permille, 7.5% -> 75 permille
        long permille = Math.round(ratePercent * 10.0);
        long calculatedFee = (priceTiyin * permille) / 1000L;
        long fee = Math.max(calculatedFee, floorTiyin);

        return Math.min(fee, priceTiyin);
    }

    public long sellerProceedsTiyin(long priceTiyin) {
        return priceTiyin - feeTiyin(priceTiyin);
    }

    public long minimumViablePriceTiyin() {
        TradeCommissionConfig config = getActiveConfig();
        return config.getLowMinSom() * 100L;
    }

    private TradeCommissionConfig createDefaultFallback() {
        return TradeCommissionConfig.builder()
                .id(TradeCommissionConfig.DEFAULT_ID)
                .bandSom(100_000L)
                .lowRatePercent(10.0)
                .highRatePercent(7.5)
                .lowMinSom(5_000L)
                .highMinSom(10_000L)
                .active(true)
                .updatedAt(Instant.now())
                .build();
    }
}
