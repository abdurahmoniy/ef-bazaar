package uz.efbazaar.trade.mailbox.link;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uz.efbazaar.trade.mailbox.link.dto.LinkSessionResponse;
import uz.efbazaar.trade.mailbox.link.dto.OpenLinkSessionRequest;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.UUID;

/** The link wizard polls these; another user's session answers 404. */
@RestController
@RequestMapping("/api/v1/mailboxes")
@RequiredArgsConstructor
public class LinkSessionController {

    private final LinkSessionService service;

    @PostMapping("/{id}/link-sessions")
    @ResponseStatus(HttpStatus.CREATED)
    public LinkSessionResponse open(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID id,
                                    @Valid @RequestBody OpenLinkSessionRequest request) {
        return toResponse(service.open(me.userId(), id, request.accountId(), request.emailAlreadySet()));
    }

    @GetMapping("/link-sessions/{sid}")
    public LinkSessionResponse get(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID sid) {
        return toResponse(service.get(me.userId(), sid));
    }

    @PostMapping("/link-sessions/{sid}/email-changed")
    public LinkSessionResponse emailChanged(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID sid) {
        return toResponse(service.emailChanged(me.userId(), sid));
    }

    @PostMapping("/link-sessions/{sid}/retry")
    public LinkSessionResponse retry(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID sid) {
        return toResponse(service.retry(me.userId(), sid));
    }

    /** "Qayta sinxronlash": the account did not get the email; send the verified event again. */
    @PostMapping("/link-sessions/{sid}/republish")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void republish(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID sid) {
        service.republish(me.userId(), sid);
    }

    @DeleteMapping("/link-sessions/{sid}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void cancel(@AuthenticationPrincipal AuthenticatedUser me, @PathVariable UUID sid) {
        service.cancel(me.userId(), sid);
    }

    private LinkSessionResponse toResponse(MailboxLinkSession s) {
        return new LinkSessionResponse(s.getId(), s.getMailboxId(), service.emailOf(s), s.getAccountId(),
                s.getState().name(), s.getStepDeadline(), s.getEmailChangeCode(), s.isNotRegistered());
    }
}
