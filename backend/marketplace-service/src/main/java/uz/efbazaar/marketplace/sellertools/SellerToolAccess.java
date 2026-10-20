package uz.efbazaar.marketplace.sellertools;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import uz.efbazaar.marketplace.exception.MarketplaceException;
import uz.efbazaar.marketplace.plan.PlanProjection;

@Service
@RequiredArgsConstructor
public class SellerToolAccess {
  private final PlanProjection plans;

  public record Capabilities(String tools, String bulk, String profileDecoration, int bulkLimit) {}

  public Capabilities capabilities(UUID user) {
    var snapshot = plans.readCapabilities(user);
    return new Capabilities(
        status(snapshot, "seller.tools"),
        status(snapshot, "seller.bulk"),
        status(snapshot, "profile.decoration"),
        50);
  }

  public static String status(PlanProjection.CapabilitiesSnapshot snapshot, String key) {
    if (!snapshot.subscriptionFresh() || !snapshot.planFresh()) return "UNAVAILABLE";
    String value = snapshot.grants().get(key);
    return "true".equals(value) ? "AVAILABLE" : "false".equals(value) ? "DENIED" : "UNAVAILABLE";
  }

  public void require(UUID user, String key) {
    String status = status(plans.readCapabilities(user), key);
    if ("UNAVAILABLE".equals(status))
      throw error(HttpStatus.SERVICE_UNAVAILABLE, "plan_unavailable");
    if (!"AVAILABLE".equals(status)) throw error(HttpStatus.FORBIDDEN, "upgrade_required");
  }

  public static MarketplaceException error(HttpStatus status, String code) {
    return new MarketplaceException(status, code, code);
  }
}
