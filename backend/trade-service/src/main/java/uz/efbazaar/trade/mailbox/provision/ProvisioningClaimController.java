package uz.efbazaar.trade.mailbox.provision;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.UUID;
/** InternalSecretFilter authenticates this one-shot external-mutation permission. */
@RestController @RequestMapping("/internal/mailboxes") @RequiredArgsConstructor
public class ProvisioningClaimController {
 private final ProvisioningClaimService claims;
 @PostMapping("/{id}/provision-claim")
 public ProvisioningClaimService.Claim claim(@PathVariable UUID id,@RequestBody ProvisioningClaimService.Request request) {
  return claims.claim(id,request);
 }
}
