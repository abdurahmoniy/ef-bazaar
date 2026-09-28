package uz.efbazaar.trade.trade.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.security.AuthenticatedUser;
import uz.efbazaar.trade.trade.dto.ProposalAcceptRequest;
import uz.efbazaar.trade.trade.dto.ProposalCreateRequest;
import uz.efbazaar.trade.trade.dto.ProposalDetailsResponse;
import uz.efbazaar.trade.trade.dto.ProposalResponse;
import uz.efbazaar.trade.trade.dto.TradeResponse;
import uz.efbazaar.trade.trade.service.TradeProposalService;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/trades/proposals")
@RequiredArgsConstructor
public class TradeProposalController {

    private final TradeProposalService proposals;

    @PostMapping
    public ResponseEntity<ProposalResponse> create(
            @AuthenticationPrincipal AuthenticatedUser me,
            @Valid @RequestBody ProposalCreateRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                proposals.create(me.userId(), req));
    }

    /**
     * Look up the active proposal for a marketplace chat. Returns 200 with
     * the pending proposal if one exists and the caller is a participant;
     * 404 otherwise (we don't distinguish "no proposal" from "not authorised"
     * so we don't leak existence).
     */
    @GetMapping
    public ResponseEntity<ProposalDetailsResponse> findByChatId(
            @AuthenticationPrincipal AuthenticatedUser me,
            @RequestParam UUID chatId) {
        return proposals.findActiveProposalByChatId(chatId, me.userId())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build());
    }

    @PostMapping("/{proposalId}/accept")
    public ResponseEntity<TradeResponse> accept(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID proposalId,
            // Optional body: accepting takes no input now that the money is
            // frozen from the buyer's wallet, so a bare POST has to work.
            @Valid @RequestBody(required = false) ProposalAcceptRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                proposals.accept(me.userId(), proposalId,
                        req == null ? null : req.cardId(),
                        req == null ? null : req.giveAccountId()));
    }

    @PostMapping("/{proposalId}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID proposalId) {
        proposals.reject(me.userId(), proposalId);
    }
}
