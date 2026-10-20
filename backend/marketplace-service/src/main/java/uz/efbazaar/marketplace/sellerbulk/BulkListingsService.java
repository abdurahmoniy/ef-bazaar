package uz.efbazaar.marketplace.sellerbulk;

import static uz.efbazaar.marketplace.sellertools.SellerToolAccess.error;

import java.math.BigDecimal;
import java.util.*;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import uz.efbazaar.marketplace.account.*;
import uz.efbazaar.marketplace.domain.ListingStatus;
import uz.efbazaar.marketplace.dto.ListingUpdateRequest;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.repository.ListingRepository;
import uz.efbazaar.marketplace.sellertools.SellerToolAccess;
import uz.efbazaar.marketplace.service.ListingService;

@Service
@Slf4j
public class BulkListingsService {
  public enum Operation {
    UNPUBLISH,
    PRICE
  }

  public record Request(Operation operation, List<UUID> listingIds, BigDecimal price) {}

  public record Item(UUID listingId, boolean success, String code) {}

  public record Result(List<Item> results) {}

  private final ListingRepository listings;
  private final UserAccountRepository accounts;
  private final ListingService lifecycle;
  private final UserAccountPublisher publisher;
  private final SellerToolAccess access;
  private final TransactionTemplate transaction;

  public BulkListingsService(
      ListingRepository listings,
      UserAccountRepository accounts,
      ListingService lifecycle,
      UserAccountPublisher publisher,
      SellerToolAccess access,
      PlatformTransactionManager manager) {
    this.listings = listings;
    this.accounts = accounts;
    this.lifecycle = lifecycle;
    this.publisher = publisher;
    this.access = access;
    transaction = new TransactionTemplate(manager);
    transaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
    transaction.setTimeout(20);
  }

  public Result execute(UUID owner, Request request) {
    validate(request);
    access.require(owner, "seller.bulk");
    List<Item> results = new ArrayList<>();
    for (UUID id : request.listingIds()) {
      try {
        transaction.executeWithoutResult(status -> apply(owner, id, request));
        results.add(new Item(id, true, "ok"));
      } catch (MarketplaceException exception) {
        results.add(new Item(id, false, exception.getCode()));
      } catch (RuntimeException exception) {
        log.error("Bulk listing {} failed", id, exception);
        results.add(new Item(id, false, "operation_failed"));
      }
    }
    return new Result(results);
  }

  private void validate(Request request) {
    if (request == null
        || request.operation() == null
        || request.listingIds() == null
        || request.listingIds().isEmpty()
        || request.listingIds().size() > 50
        || request.listingIds().contains(null)
        || new HashSet<>(request.listingIds()).size() != request.listingIds().size())
      throw error(HttpStatus.BAD_REQUEST, "invalid_bulk_request");
    BigDecimal price = request.price();
    if (request.operation() == Operation.PRICE
        && (price == null
            || price.compareTo(new BigDecimal("5000.00")) < 0
            || price.scale() > 2
            || price.precision() - price.scale() > 17))
      throw error(HttpStatus.BAD_REQUEST, "invalid_price");
    if (request.operation() == Operation.UNPUBLISH && price != null)
      throw error(HttpStatus.BAD_REQUEST, "invalid_bulk_request");
  }

  private void apply(UUID owner, UUID id, Request request) {
    access.require(owner, "seller.bulk");
    // Account-first lock order matches publish/unpublish. Re-read all mutable
    // ownership, linkage and archive state after acquiring the row lock.
    UserAccount account = null;
    var linked = accounts.findLinkedToListing(id);
    if (linked.size() > 1) throw error(HttpStatus.CONFLICT, "account_link_changed");
    if (!linked.isEmpty()) {
      account = linked.get(0);
      if (!owner.equals(account.getOwnerId()))
        throw error(HttpStatus.NOT_FOUND, "listing_not_found");
      if (account.getStatus() != UserAccountStatus.ACTIVE)
        throw error(HttpStatus.CONFLICT, "account_archived");
      if (!id.equals(account.getCurrentListingId()))
        throw error(HttpStatus.CONFLICT, "account_link_changed");
    }
    var listing =
        listings
            .findByIdForUpdate(id)
            .orElseThrow(() -> error(HttpStatus.NOT_FOUND, "listing_not_found"));
    if (account == null && accounts.existsByCurrentListingIdOrSourceListingId(id, id))
      throw error(HttpStatus.CONFLICT, "account_link_changed");
    if (!owner.equals(listing.getSellerId()))
      throw error(HttpStatus.NOT_FOUND, "listing_not_found");
    if (listing.getStatus() != ListingStatus.ACTIVE)
      throw error(HttpStatus.CONFLICT, "listing_not_active");
    // Waiting for row locks can outlive paid access or projection freshness.
    access.require(owner, "seller.bulk");
    if (request.operation() == Operation.UNPUBLISH) {
      if (account == null) lifecycle.delete(id, owner);
      else publisher.unpublish(account.getId(), owner);
    } else {
      lifecycle.update(
          id, owner, new ListingUpdateRequest(null, request.price(), null, null), List.of());
    }
  }
}
