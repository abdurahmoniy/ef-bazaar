package uz.efbazaar.marketplace.sellertools;

import static uz.efbazaar.marketplace.sellertools.SellerToolsService.*;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.marketplace.security.AuthenticatedUser;

@RestController
@RequestMapping(value = "/api/v1/seller-tools", produces = MediaType.APPLICATION_JSON_VALUE)
@RequiredArgsConstructor
public class SellerToolsController {
  private final SellerToolsService service;
  private final SellerToolAccess access;

  @ModelAttribute
  void noStore(jakarta.servlet.http.HttpServletResponse response) {
    response.setHeader("Cache-Control", "no-store");
  }

  @GetMapping("/capabilities")
  public SellerToolAccess.Capabilities capabilities(
      @AuthenticationPrincipal AuthenticatedUser user) {
    return access.capabilities(user.userId());
  }

  @GetMapping("/{kind:templates|notes}")
  public Page list(
      @AuthenticationPrincipal AuthenticatedUser user,
      @PathVariable Kind kind,
      @RequestParam(defaultValue = "0") int page,
      @RequestParam(defaultValue = "50") int size,
      @RequestParam(required = false) UUID chatId,
      @RequestParam(required = false) UUID listingId) {
    return service.list(user.userId(), kind, page, size, chatId, listingId);
  }

  @GetMapping("/{kind:templates|notes}/{id}")
  public Row get(
      @AuthenticationPrincipal AuthenticatedUser user,
      @PathVariable Kind kind,
      @PathVariable UUID id) {
    return service.get(user.userId(), kind, id);
  }

  @PostMapping("/{kind:templates|notes}")
  @ResponseStatus(HttpStatus.CREATED)
  public Row create(
      @AuthenticationPrincipal AuthenticatedUser user,
      @PathVariable Kind kind,
      @RequestBody Input input) {
    return service.save(user.userId(), kind, null, input);
  }

  @PutMapping("/{kind:templates|notes}/{id}")
  public Row update(
      @AuthenticationPrincipal AuthenticatedUser user,
      @PathVariable Kind kind,
      @PathVariable UUID id,
      @RequestBody Input input) {
    return service.save(user.userId(), kind, id, input);
  }

  @DeleteMapping("/{kind:templates|notes}/{id}")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(
      @AuthenticationPrincipal AuthenticatedUser user,
      @PathVariable Kind kind,
      @PathVariable UUID id) {
    service.delete(user.userId(), kind, id);
  }

  @GetMapping(value = "/export", produces = MediaType.APPLICATION_JSON_VALUE)
  public ResponseEntity<Export> export(@AuthenticationPrincipal AuthenticatedUser user) {
    return ResponseEntity.ok()
        .header("Content-Disposition", "attachment; filename=\"seller-tools.json\"")
        .cacheControl(CacheControl.noStore())
        .body(service.export(user.userId()));
  }
}
