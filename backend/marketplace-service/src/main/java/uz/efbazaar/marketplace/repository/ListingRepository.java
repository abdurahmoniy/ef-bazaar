package uz.efbazaar.marketplace.repository;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import uz.efbazaar.marketplace.domain.Listing;
import uz.efbazaar.marketplace.domain.ListingStatus;

import java.util.UUID;

public interface ListingRepository extends JpaRepository<Listing, UUID>,
        JpaSpecificationExecutor<Listing> {

    Page<Listing> findBySellerId(UUID sellerId, Pageable pageable);

    Page<Listing> findByStatus(ListingStatus status, Pageable pageable);
}
