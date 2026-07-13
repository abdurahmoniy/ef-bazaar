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

    @PostMapping("/{proposalId}/accept")
    public ResponseEntity<TradeResponse> accept(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID proposalId,
            @Valid @RequestBody ProposalAcceptRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(
                proposals.accept(me.userId(), proposalId, req.cardId()));
    }

    @PostMapping("/{proposalId}/reject")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void reject(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID proposalId) {
        proposals.reject(me.userId(), proposalId);
    }
}
