package uz.efbazaar.marketplace.analytics.seller;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

@RestController
@RequiredArgsConstructor
@RequestMapping(value = "/api/v1/seller-analytics", produces = MediaType.APPLICATION_JSON_VALUE)
public class SellerAnalyticsController {
  private final SellerAnalyticsService analytics;

  @GetMapping("/summary")
  public SellerAnalyticsService.Summary summary(@AuthenticationPrincipal AuthenticatedUser user) {
    return analytics.summary(user.userId());
  }

  @GetMapping("/report")
  public SellerAnalyticsService.Report report(
      @AuthenticationPrincipal AuthenticatedUser user,
      @RequestParam int days,
      @RequestParam(required = false) UUID listingId,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size) {
    return analytics.report(user.userId(), days, listingId, page, size);
  }

  @GetMapping(value = "/export", produces = "text/csv")
  public ResponseEntity<String> export(
      @AuthenticationPrincipal AuthenticatedUser user,
      @RequestParam int days,
      @RequestParam(required = false) UUID listingId) {
    return ResponseEntity.ok()
        .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"seller-analytics.csv\"")
        .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
        .body(analytics.export(user.userId(), days, listingId));
  }
}
