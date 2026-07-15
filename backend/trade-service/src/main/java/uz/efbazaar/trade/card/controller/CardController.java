package uz.efbazaar.trade.card.controller;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import uz.efbazaar.trade.card.dto.CardCreateRequest;
import uz.efbazaar.trade.card.dto.CardResponse;
import uz.efbazaar.trade.card.mapper.CardMapper;
import uz.efbazaar.trade.card.service.CardService;
import uz.efbazaar.trade.security.AuthenticatedUser;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/cards")
@RequiredArgsConstructor
public class CardController {

    private final CardService cardService;
    private final CardMapper mapper;

    @PostMapping
    public ResponseEntity<CardResponse> create(
            @AuthenticationPrincipal AuthenticatedUser me,
            @Valid @RequestBody CardCreateRequest request) {
        var card = cardService.create(me.userId(), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(mapper.toResponse(card));
    }

    @GetMapping
    public List<CardResponse> listSaved(@AuthenticationPrincipal AuthenticatedUser me) {
        return cardService.listSaved(me.userId()).stream()
                .map(mapper::toResponse)
                .toList();
    }

    @DeleteMapping("/{cardId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void delete(
            @AuthenticationPrincipal AuthenticatedUser me,
            @PathVariable UUID cardId) {
        cardService.delete(me.userId(), cardId);
    }
}
