package uz.efbazaar.marketplace.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * Spring Data JPA'ning "nested repository interface"'larini scan qilishini yoqadi.
 * Trust va Gamer paketlaridagi JPA repository'lar container-class ichida
 * (TrustRepositories, GamerRepositories) — default'da skip qilinardi va
 * PenaltyRepository/ComplaintRepository/GamerStatsRepository bean sifatida
 * ro'yxatga olinmasdi.
 *
 * Alohida class'da yashaydi (main class'da emas), chunki MarketplaceApplicationTests
 * JPA + DataSource auto-config'ni exclude qiladi — u yerda JPA scan majburiy
 * bo'lmasligi kerak. "test" profili aktiv bo'lsa, bu config o'chadi.
 */
@Configuration(proxyBeanMethods = false)
@Profile("!test")
@EnableJpaRepositories(considerNestedRepositories = true)
class NestedJpaRepositoriesConfig {
}
