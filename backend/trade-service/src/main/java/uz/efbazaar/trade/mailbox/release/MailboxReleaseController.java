package uz.efbazaar.trade.mailbox.release;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import java.util.UUID;
@RestController
@RequestMapping("/api/v1/mailboxes")
@RequiredArgsConstructor
public class MailboxReleaseController {
 private final MailboxReleaseService release;
 public record Confirm(UUID requestId,boolean confirmDelete) {}
 @PostMapping("/{id}/release-check") public MailboxReleaseService.Check start(@AuthenticationPrincipal AuthenticatedUser me,@PathVariable UUID id){return release.start(me.userId(),id);}
 @GetMapping("/{id}/release-check/{requestId}") public MailboxReleaseService.Check status(@AuthenticationPrincipal AuthenticatedUser me,@PathVariable UUID id,@PathVariable UUID requestId){return release.status(me.userId(),id,requestId);}
 @PostMapping("/{id}/release") public MailboxDeletionService.Result release(@AuthenticationPrincipal AuthenticatedUser me,@PathVariable UUID id,@RequestBody Confirm req){return release.release(me.userId(),id,req.requestId(),req.confirmDelete());}
}
