package uz.efbazaar.trade.mailbox.resource;

import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.trade.security.AuthenticatedUser;
import java.util.List;

@RestController
@RequiredArgsConstructor
public class MailboxResourceController {
    private final MailboxResourceService resources;
    @GetMapping("/api/v1/mailboxes/resources")
    public List<MailboxResource> mine(@AuthenticationPrincipal AuthenticatedUser me) {
        return resources.resources(me.userId(), false);
    }
    @GetMapping("/api/v1/admin/mailboxes/resources")
    public List<MailboxResource> admin() { return resources.resources(null, true); }
}
