package uz.efbazaar.marketplace.profileappearance;

import static uz.efbazaar.marketplace.sellertools.SellerToolAccess.error;

import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import uz.efbazaar.marketplace.security.AuthenticatedUser;
import uz.efbazaar.marketplace.sellertools.SellerToolAccess;
import uz.efbazaar.marketplace.service.MediaService;

@RestController
@RequestMapping(value = "/api/v1/profiles", produces = MediaType.APPLICATION_JSON_VALUE)
@RequiredArgsConstructor
public class ProfileAppearanceController {
  private final ProfileAppearanceStore store;
  private final SellerToolAccess access;
  private final MediaService media;

  @ModelAttribute
  void noStore(jakarta.servlet.http.HttpServletResponse response) {
    response.setHeader("Cache-Control", "no-store");
  }

  @GetMapping("/{userId}/appearance")
  public ProfileAppearanceStore.Appearance publicAppearance(@PathVariable UUID userId) {
    return store.publicAppearance(userId);
  }

  @GetMapping("/me/appearance")
  public ProfileAppearanceStore.OwnAppearance own(@AuthenticationPrincipal AuthenticatedUser user) {
    return store.own(user.userId());
  }

  @PutMapping(value = "/me/appearance/cover", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
  public ProfileAppearanceStore.OwnAppearance upload(
      @AuthenticationPrincipal AuthenticatedUser user,
      @RequestPart("file") List<MultipartFile> files) {
    access.require(user.userId(), "profile.decoration");
    media.validateSingleImage(files);
    // Bot I/O holds no database transaction; store rechecks paid access after upload.
    List<String> ids = media.uploadToBot(files, "efBazaar profile cover", null);
    if (ids.size() != 1 || ids.get(0) == null || ids.get(0).isBlank())
      throw error(HttpStatus.BAD_GATEWAY, "invalid_upload_response");
    return store.save(user.userId(), ids.get(0));
  }

  @DeleteMapping("/me/appearance/cover")
  @ResponseStatus(HttpStatus.NO_CONTENT)
  public void delete(@AuthenticationPrincipal AuthenticatedUser user) {
    store.save(user.userId(), null);
  }
}
