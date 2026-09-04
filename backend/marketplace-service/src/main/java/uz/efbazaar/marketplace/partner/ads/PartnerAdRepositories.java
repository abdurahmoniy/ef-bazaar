package uz.efbazaar.marketplace.partner.ads;

import org.springframework.data.jpa.repository.JpaRepository;
import uz.efbazaar.marketplace.partner.PartnerChannel;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public final class PartnerAdRepositories {

    private PartnerAdRepositories() {}

    public interface PartnerChannelRepository extends JpaRepository<PartnerChannel, UUID> {
        Optional<PartnerChannel> findByPartnerUserIdAndActiveTrue(UUID partnerUserId);
        Optional<PartnerChannel> findByLinkCode(String linkCode);
        Optional<PartnerChannel> findByApplicationId(UUID applicationId);
        Optional<PartnerChannel> findByTelegramChannelIdAndActiveTrue(Long telegramChannelId);
        Optional<PartnerChannel> findFirstByTelegramChannelIdAndPartnerUserIdOrderByCreatedAtDesc(
                Long telegramChannelId, UUID partnerUserId);
        boolean existsByLinkCode(String linkCode);
        List<PartnerChannel> findByActiveTrueOrderBySubscriberCountDesc();
        List<PartnerChannel> findByActiveTrueAndTitleStartsWithIgnoreCaseOrderBySubscriberCountDesc(String prefix);
    }

    public interface ListingChannelPostRepository extends JpaRepository<ListingChannelPost, UUID> {
        List<ListingChannelPost> findByOrderId(UUID orderId);
        List<ListingChannelPost> findByListingId(UUID listingId);
        List<ListingChannelPost> findByPartnerChannelIdOrderByCreatedAtDesc(UUID partnerChannelId);
        List<ListingChannelPost> findByPartnerChannelIdAndState(UUID partnerChannelId, String state);
    }

    public interface PartnerClickRepository extends JpaRepository<PartnerClick, Long> {
        long countByPartnerChannelId(UUID partnerChannelId);
    }

    public interface ListingPartnerAttributionRepository
            extends JpaRepository<ListingPartnerAttribution, ListingPartnerAttribution.Key> {}
}
