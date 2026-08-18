package uz.efbazaar.payment.wallet.repository;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.payment.wallet.domain.TradeCommissionConfig;

public interface TradeCommissionConfigRepository extends JpaRepository<TradeCommissionConfig, String> {
}
