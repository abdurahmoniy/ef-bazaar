package uz.efbazaar.marketplace.sellerbulk;

import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

@RestController
@RequiredArgsConstructor
public class BulkListingsController {
  private final BulkListingsService service;

  @ModelAttribute
  void noStore(jakarta.servlet.http.HttpServletResponse response) {
    response.setHeader("Cache-Control", "no-store");
  }

  @PostMapping(
      value = "/api/v1/seller-tools/listings/bulk",
      produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<BulkListingsService.Result> execute(
      @AuthenticationPrincipal AuthenticatedUser user,
      @RequestBody BulkListingsService.Request request) {
    return ResponseEntity.ok()
        .cacheControl(CacheControl.noStore())
        .body(service.execute(user.userId(), request));
  }
}
